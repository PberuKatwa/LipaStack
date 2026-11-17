# Paystack Webhook Implementation Plan

## Scope

Add a Paystack webhook endpoint to the existing `PaystackModule` without introducing a database, repository, event bus, or new persistence dependency.

The first version will:

- Receive Paystack `POST` webhook requests.
- Validate the `x-paystack-signature` header with the configured Paystack secret key.
- Parse and validate the webhook JSON payload with Zod.
- Log the validated event.
- For `charge.success`, use the existing Paystack client to verify the transaction and log the verification result.
- Leave payment persistence and business fulfilment for a future implementation.

The webhook endpoint will be:

```text
POST /paystack/webhook
```

The full public URL will depend on the deployed application, for example:

```text
https://api.example.com/paystack/webhook
```

## Paystack Requirements

The implementation follows the current Paystack webhook documentation at:

`https://paystack.com/docs/payments/webhooks/`

Paystack requires the following:

- The webhook URL must be a publicly accessible `POST` endpoint.
- The endpoint must parse the JSON request body.
- The endpoint should acknowledge valid events with `200 OK` promptly.
- Paystack sends the `x-paystack-signature` header.
- The header contains an HMAC-SHA512 signature of the event payload, generated with the Paystack secret key.
- Paystack webhook IPs are `52.31.139.75`, `52.49.173.169`, and `52.214.14.220` (the same for test and live).
- Failed live deliveries are retried every 3 minutes for the first 4 attempts and then hourly for 72 hours.
- Failed test deliveries are retried hourly for 10 hours, with a 30-second request timeout.

The webhook URL must be configured separately for test mode and live mode in the Paystack Dashboard under Developer settings:

`https://dashboard.paystack.com/#/settings/developer`

### Note on Paystack's sample code

Paystack's own documentation example recomputes the signature over `JSON.stringify(req.body)`:

```js
const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');
```

This works in practice because Paystack sends compact JSON and JavaScript preserves key insertion order, so `JSON.stringify(req.body)` usually reproduces the original bytes. However, it is not guaranteed: any whitespace, key ordering, or formatting difference changes the signed bytes and produces a mismatched signature. The implementation below uses the untouched `req.rawBody` (the original bytes as received) so the signature check is byte-exact and robust. Do not reconstruct the body with `JSON.stringify(req.body)` before validating.

## Changes

The changes below are **additive only**. Existing methods are shown as unchanged and are not repeated.

### 1. Enable Raw Request Bodies — `src/main.ts`

Change the `NestFactory.create` call to pass `rawBody: true`:

```ts
const app = await NestFactory.create(AppModule, { rawBody: true });
```

NestJS's underlying Express body parser discards the original bytes after parsing. `rawBody: true` makes NestJS also store the original request body on `req.rawBody`, which the webhook handler needs for signature validation.

### 2. Webhook Payload Schemas — `src/modules/paystack/types/paystack-client.types.ts`

No change. The schemas below already exist in this file and are used by the new service method:

```ts
export const paystackWebhookEventSchema = z.object({
  event: z.string().min(1),
  data: z.unknown(),
});

export type PaystackWebhookEvent = z.infer<typeof paystackWebhookEventSchema>;

export const paystackChargeSuccessWebhookDataSchema = z.object({
  reference: z.string().min(1),
  status: z.string().min(1),
});

export type PaystackChargeSuccessWebhookData = z.infer<
  typeof paystackChargeSuccessWebhookDataSchema
>;
```

### 3. Webhook Error Class — `src/modules/paystack/paystack.errors.ts`

Add a `PaystackWebhookError` carrying an HTTP status code, extending the existing `PaystackError`. Add it alongside the other error classes:

```ts
export class PaystackWebhookError extends PaystackError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
    this.name = 'PaystackWebhookError';
  }
}
```

`PaystackWebhookError` distinguishes request-side problems (missing/invalid signature, malformed payload) from Paystack API failures, so the controller can map each to the correct HTTP status.

### 4. Signature Validation and Event Handling — `src/modules/paystack/paystack.service.ts`

**4a. Add these imports:**

```ts
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { type PaystackEnvironment } from 'src/config/env.types';
import { PaystackWebhookError } from './paystack.errors';
```

Extend the existing `./types/paystack-client.types` import with the four webhook symbols:

```ts
import {
  type PaystackChargeRequest,
  paystackChargeSuccessWebhookDataSchema,
  type PaystackChargeSuccessWebhookData,
  type PaystackWebhookEvent,
  paystackWebhookEventSchema,
} from './types/paystack-client.types';
```

**4b. Add `ConfigService` to the constructor:**

```ts
constructor(
  private readonly logger: AppLogger,
  private readonly paystackClient: PaystackClient,
  private readonly configService: ConfigService,
) {}
```

`ConfigService` is available because `ConfigModule.forRoot({ isGlobal: true })` is configured in `app.module.ts`.

**4c. Add these two methods to the class (existing methods unchanged):**

```ts
async handleWebhookEvent(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
): Promise<void> {
  if (rawBody === undefined) {
    throw new PaystackWebhookError('Missing raw request body', 400);
  }

  if (signatureHeader === undefined) {
    throw new PaystackWebhookError('Missing x-paystack-signature header', 401);
  }

  if (!this.isValidSignature(rawBody, signatureHeader)) {
    throw new PaystackWebhookError('Invalid x-paystack-signature', 401);
  }

  let event: PaystackWebhookEvent;
  try {
    event = parseWithSchema(
      paystackWebhookEventSchema,
      JSON.parse(rawBody.toString('utf8')),
      'Paystack webhook event',
    );
  } catch {
    throw new PaystackWebhookError('Invalid webhook payload', 400);
  }

  this.logger.info('Received Paystack webhook event', { event: event.event });

  if (event.event !== 'charge.success') {
    this.logger.info('Unsupported Paystack webhook event', { event: event.event });
    return;
  }

  let data: PaystackChargeSuccessWebhookData;
  try {
    data = parseWithSchema(
      paystackChargeSuccessWebhookDataSchema,
      event.data,
      'charge.success webhook data',
    );
  } catch {
    throw new PaystackWebhookError('Invalid charge.success webhook data', 400);
  }

  const verification = await this.paystackClient.verifyTransaction(data.reference);

  this.logger.info('Verified charge.success transaction', {
    reference: data.reference,
    status: verification.data.status,
  });
}

private isValidSignature(rawBody: Buffer, receivedSignature: string): boolean {
  const secretKey = this.configService.getOrThrow<PaystackEnvironment['secretKey']>('secretKey');
  const expectedSignature = createHmac('sha512', secretKey).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const receivedBuffer = Buffer.from(receivedSignature, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
```

Design notes:

- The signature is validated **before** the payload is parsed or trusted.
- `rawBody` is fed directly to `createHmac` as a `Buffer`, so the digest is computed over the exact bytes Paystack signed.
- Both signatures are compared as UTF-8 byte buffers using `timingSafeEqual`, which requires equal lengths — hence the explicit length check first.
- The secret key comes from `ConfigService`, never `process.env`.
- The log statements never include the secret key, the signature, or the full raw body.

### 5. Controller Route — `src/modules/paystack/paystack.controller.ts`

**5a. Add these imports:**

```ts
import { type RawBodyRequest } from '@nestjs/common';
import { PaystackError, PaystackWebhookError } from './paystack.errors';
```

`RawBodyRequest` is a type, so add it to the existing `@nestjs/common` import as a `type` import (e.g. alongside `Controller`, `Post`, `Req`, `Res`).

**5b. Add the route and helper to the class (existing routes unchanged):**

```ts
@Post('webhook')
async handleWebhook(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<Response> {
  try {
    const rawBody = req.rawBody;
    const signatureHeader = this.normalizeSignatureHeader(req.headers['x-paystack-signature']);

    await this.paystackService.handleWebhookEvent(rawBody, signatureHeader);

    const response: ApiResponse = {
      success: true,
      message: 'Webhook received',
    };

    return res.status(200).json(response);
  } catch (error) {
    this.logger.error('Error handling Paystack webhook', { error });

    if (error instanceof PaystackWebhookError) {
      const response: ApiResponse = {
        success: false,
        message: error.message,
      };

      return res.status(error.statusCode ?? 400).json(response);
    }

    if (error instanceof PaystackError) {
      const response: ApiResponse = {
        success: false,
        message: error.message,
      };

      return res.status(502).json(response);
    }

    const response: ApiResponse = {
      success: false,
      message: `${error}`,
    };

    return res.status(500).json(response);
  }
}

private normalizeSignatureHeader(header: string | string[] | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }

  return Array.isArray(header) ? header[0] : header;
}
```

### 6. Module and Configuration

No change. `PaystackModule` already registers `PaystackController`, `PaystackClient`, and `PaystackService`, and `ConfigModule` is global. The existing configuration already provides:

```text
PAYSTACK_SECRET_KEY_DEVELOPMENT
PAYSTACK_SECRET_KEY_PRODUCTION
```

The service consumes the parsed configuration through `ConfigService` (the `secretKey` key). It must not access `process.env` directly.

## Status Code Mapping

| Condition | HTTP status |
| --- | --- |
| Valid, parsed event | `200 OK` |
| Missing `x-paystack-signature` header | `401 Unauthorized` |
| Invalid signature | `401 Unauthorized` |
| Missing raw body | `400 Bad Request` |
| Invalid JSON or invalid event envelope | `400 Bad Request` |
| `charge.success` with missing/invalid reference | `400 Bad Request` |
| Paystack transaction verification failure | `502 Bad Gateway` |
| Unexpected internal error | `500 Internal Server Error` |

A non-2xx response for a failed event causes Paystack to retry delivery. A valid event that is acknowledged with `200 OK` is not retried.

## Request Processing Flow

```text
Paystack
  -> POST /paystack/webhook
  -> read raw body and signature
  -> validate HMAC-SHA512 signature
  -> parse and validate event envelope
  -> log the event
  -> for charge.success, verify the transaction with Paystack
  -> log the verification result
  -> return HTTP 200
```

The current implementation is intentionally limited to observability. Future work can add persistence and fulfilment after the event has been verified without changing the public webhook URL.

## Security Requirements

- Use the Paystack secret key from `ConfigService`.
- Validate the signature before trusting or processing the payload.
- Compare signatures in constant time with `timingSafeEqual`.
- Handle unequal signature lengths before calling `timingSafeEqual`.
- Do not expose the secret key in logs or responses.
- Do not log the complete raw request body if it may contain customer or payment data.
- Consider adding Paystack IP allowlisting at the infrastructure or application layer using the documented Paystack IP addresses (`52.31.139.75`, `52.49.173.169`, `52.214.14.220`).
- Do not treat the event payload alone as proof that money was received; use `verifyTransaction` for `charge.success`.

## Dashboard Setup

1. Sign in to the Paystack Dashboard.
2. Switch to test mode.
3. Open **Settings → Developer/Webhook Settings**.
4. Register the public test webhook URL, such as `https://staging.example.com/paystack/webhook`.
5. Test a payment and confirm that the application logs the received event.
6. Confirm the transaction reference is verified through the Paystack API.
7. Switch to live mode.
8. Register the production webhook URL separately, such as `https://api.example.com/paystack/webhook`.

Paystack test and live modes use different credentials and webhook configuration. The environment running the webhook must use the secret key for the corresponding Paystack mode.

## Local Testing

Paystack cannot deliver webhooks directly to `localhost`. Use a public HTTPS tunnel or the Paystack Dev CLI to forward requests to the local NestJS server.

The repository's Paystack documentation references the Paystack Dev CLI:

`https://www.npmjs.com/package/@paystack-oss/dev-cli`

To test the endpoint locally, generate the signature from the **exact** request body bytes using HMAC-SHA512 and the test secret key, then send the request with `curl`:

```bash
BODY='{"event":"charge.success","data":{"reference":"abc123","status":"success"}}'

SIG=$(node -e 'const { createHmac } = require("crypto"); process.stdout.write(createHmac("sha512", process.argv[1]).update(process.argv[2]).digest("hex"));' "$PAYSTACK_SECRET_KEY" "$BODY")

curl -i -X POST http://localhost:3000/paystack/webhook \
  -H 'Content-Type: application/json' \
  -H "x-paystack-signature: $SIG" \
  --data-binary "$BODY"
```

Do not format or reorder the JSON after generating the signature; `--data-binary` sends the body exactly as written.

The local test should confirm all of the following:

- The forwarded request reaches `POST /paystack/webhook`.
- `req.rawBody` is present.
- The signature is accepted with the matching test secret key.
- The event name is logged.
- A `charge.success` reference is sent through `verifyTransaction`.
- The endpoint returns `200 OK` for a valid event.
- A modified body or incorrect signature returns `401 Unauthorized`.
- A malformed JSON payload does not cause an unhandled exception.

## Verification and Quality Checks

After implementation, run:

```text
npm run build
npm run check
npm run stylecheck
```

The implementation should also be manually checked with:

- A valid `charge.success` payload.
- A valid unsupported event payload.
- A missing signature.
- An invalid signature.
- A missing raw body.
- Invalid JSON.
- A valid event with missing `charge.success` reference.
- A Paystack transaction verification failure.

## Future Extension Point

The webhook service should keep event reception and verification separate from future business actions. When persistence is introduced later, the verified `charge.success` result can be passed to a payment or order service that owns database writes and idempotency.

Future additions should include:

- Idempotency based on the Paystack transaction reference.
- Persistent webhook or payment records.
- Order fulfilment after confirmed payment.
- Retry-safe background processing for long-running work.
- Additional event-specific schemas and handlers.
