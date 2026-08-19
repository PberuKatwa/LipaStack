
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

## Existing Structure

The implementation must remain inside the existing Paystack module:

```text
src/modules/paystack/
├── paystack.client.ts
├── paystack.controller.ts
├── paystack.errors.ts
├── paystack.module.ts
├── paystack.service.ts
├── paystack.utils.ts
└── types/
    ├── paystack-client.types.ts
    ├── paystack-error.types.ts
    └── paystack.types.ts
```

Responsibilities should remain separated as follows:

- `paystack.controller.ts`: HTTP request extraction and HTTP response handling.
- `paystack.service.ts`: signature validation, webhook parsing, event handling, and logging.
- `paystack.client.ts`: outbound requests to the Paystack API, including transaction verification.
- `types/paystack-client.types.ts`: schemas and types representing Paystack payloads.
- `main.ts`: enable access to the raw request body required for signature validation.
- `paystack.module.ts`: no structural change is expected because the existing controller, service, and client are already registered.

## Paystack Requirements

The implementation follows the current Paystack webhook documentation at:

`https://paystack.com/docs/payments/webhooks/`

Paystack requires the following:

- The webhook URL must be a publicly accessible `POST` endpoint.
- The endpoint must parse the JSON request body.
- The endpoint should acknowledge valid events with `200 OK` promptly.
- Paystack sends the `x-paystack-signature` header.
- The header contains an HMAC-SHA512 signature generated with the Paystack secret key.
- Paystack webhook IPs are `52.31.139.75`, `52.49.173.169`, and `52.214.14.220`.
- Failed live deliveries are retried every 3 minutes for the first 4 attempts and then hourly for 72 hours.
- Failed test deliveries are retried hourly for 10 hours, with a 30-second request timeout.

The webhook URL must be configured separately for test mode and live mode in the Paystack Dashboard under Developer settings:

`https://dashboard.paystack.com/#/settings/developer`

## File Changes

### 1. Enable Raw Request Bodies

Update `src/main.ts` so NestJS stores the original request body on `req.rawBody`:

```ts
const app = await NestFactory.create(AppModule, { rawBody: true });
```

The raw body must be used for HMAC validation. Do not reconstruct the body with `JSON.stringify(req.body)` before validating the signature, because formatting and property ordering can change the signed payload.

The request should be typed with NestJS's `RawBodyRequest<Request>` type:

```ts
import { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
```

Use a type-only import if the installed NestJS type export and lint configuration require it.

### 2. Add Webhook Payload Schemas

Update `src/modules/paystack/types/paystack-client.types.ts` with schemas for the generic Paystack webhook envelope and the transaction data needed by `charge.success`.

The generic event should remain permissive for future Paystack events, while `charge.success` should have a dedicated schema:

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

The event data should be parsed with `paystackChargeSuccessWebhookDataSchema` only when `event` equals `charge.success`. This avoids requiring every supported Paystack event to have the same data shape.

The schema should not silently accept a missing event name or malformed JSON. Invalid payloads should be logged and handled according to the controller response policy described below.

### 3. Add Signature Validation to the Service

Update `src/modules/paystack/paystack.service.ts` with a webhook handler method. The method should receive:

- The original raw request body as a `Buffer`.
- The normalized `x-paystack-signature` header as `string | undefined`.

The service should:

1. Read `secretKey` from `ConfigService` using the existing typed configuration key, `secretKey`.
2. Reject requests without a raw body.
3. Reject requests without a signature header.
4. Calculate the expected HMAC-SHA512 digest using the raw body.
5. Compare signatures using `timingSafeEqual` after checking that both buffers have the same length.
6. Parse the raw body as JSON.
7. Validate the generic event envelope with `parseWithSchema`.
8. Log the event name and relevant safe metadata.

The signature calculation should follow this shape:

```ts
const expectedSignature = createHmac('sha512', secretKey)
  .update(rawBody)
  .digest('hex');
```

Do not log the secret key, the signature, or the complete raw request body. The logged event should contain only fields needed for diagnosis, such as the event name and transaction reference.

A small private service method may be used for signature verification if that keeps `handleWebhookEvent` readable. The method must have explicit parameter and return types and must not use `any`, type assertions, non-null assertions, or lint suppression.

### 4. Handle `charge.success`

Inside `PaystackService.handleWebhookEvent`:

1. Check whether the event name is `charge.success`.
2. Parse the event data with `paystackChargeSuccessWebhookDataSchema`.
3. Pass the validated reference to the existing `PaystackClient.verifyTransaction` method.
4. Log the verified transaction result.
5. Do not write to a database or mark an order as fulfilled yet.

The existing `PaystackClient.verifyTransaction` method should be reused. Do not duplicate the `/transaction/verify/:reference` request in the controller or service.

For events other than `charge.success`, log the event name and return without failing the webhook. This allows the endpoint to acknowledge future Paystack events while their business handling is added later.

The log messages should distinguish between:

- A valid event received.
- A `charge.success` event verified with Paystack.
- An unsupported event received.
- An invalid signature.
- An invalid event payload.
- A Paystack verification failure.

### 5. Add the Controller Route

Update `src/modules/paystack/paystack.controller.ts` with a `POST` route at `webhook`.

The controller should:

1. Read `req.rawBody` from `RawBodyRequest<Request>`.
2. Read `req.headers['x-paystack-signature']`.
3. Normalize the header because Express can represent a header as a string, an array, or undefined.
4. Call `paystackService.handleWebhookEvent`.
5. Return `200 OK` for a valid and parsed event.
6. Return `401 Unauthorized` when the signature is missing or invalid.
7. Return an appropriate non-2xx response for malformed payloads or internal processing failures so Paystack can retry when the event was not successfully handled.

The controller should use the project's existing `@Req()`/`@Res()` style and `AppLogger` pattern. It should not contain HMAC or Paystack API logic.

The response body can use the existing `ApiResponse` shape, for example:

```ts
{
  success: true,
  message: 'Webhook received',
}
```

For an invalid signature, do not return `200 OK`. A successful response for an unauthenticated request would acknowledge a request that was not accepted.

### 6. Module Registration

No new module is required. `PaystackModule` already registers:

```ts
controllers: [PaystackController],
providers: [PaystackClient, PaystackService],
```

No database module, ORM, repository, queue, or event-emitter dependency should be added for this first implementation.

### 7. Configuration

No new environment variable is needed. The existing configuration already provides:

```text
PAYSTACK_SECRET_KEY_DEVELOPMENT
PAYSTACK_SECRET_KEY_PRODUCTION
```

The service must consume the parsed configuration through `ConfigService`. It must not access `process.env` directly. The existing `paystackConfig` factory remains the only place that reads environment variables.

## Request Processing Flow

The intended request flow is:

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
- Consider adding Paystack IP allowlisting at the infrastructure or application layer using the documented Paystack IP addresses.
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

The local test should confirm all of the following:

- The forwarded request reaches `POST /paystack/webhook`.
- `req.rawBody` is present.
- The signature is accepted with the matching test secret key.
- The event name is logged.
- A `charge.success` reference is sent through `verifyTransaction`.
- The endpoint returns `200 OK` for a valid event.
- A modified body or incorrect signature returns `401 Unauthorized`.
- A malformed JSON payload does not cause an unhandled exception.

When testing manually, generate the signature from the exact request body bytes using HMAC-SHA512 and the test secret key. Do not format or reorder the JSON after generating the signature.

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
