# Paystack M-Pesa STK Push Integration Plan

## 1. Goal

Implement the first payment channel of the LipaStack gateway: **Paystack M-Pesa STK Push** (provider code `mpesa`, Kenya only). The scaffold must be provider-agnostic so future providers/channels can be added without touching the HTTP layer.

Out of scope: database persistence (in-memory store only), auth on our endpoints, webhook URL registration in the Paystack dashboard (manual step).

## 2. How the integration works (from Paystack docs)

1. We call `POST https://api.paystack.co/charge` with `email`, `amount` (minor units), `currency: "KES"` and `mobile_money: { phone, provider: "mpesa" }`. Phone should be in international format, e.g. `+254722000000`.
2. Paystack responds with `data.status: "pay_offline"`, a `reference` and a `display_text`. An STK prompt is pushed to the customer's phone.
3. The customer enters their M-Pesa PIN. They have **180 seconds**, after which the transaction fails.
4. The final result arrives **asynchronously** via webhook event `charge.success` on our webhook URL. Events carry an `x-paystack-signature` header: HMAC-SHA512 hex digest of the raw JSON body, keyed with our secret key.
5. Fallback for slow/missing webhooks: `GET https://api.paystack.co/transaction/verify/:reference`.

References:

- Payment channels (mobile money / M-PESA): https://paystack.com/docs/payments/payment-channels/#mobile-money
- Charge API: https://paystack.com/docs/api/charge
- Verify transaction: https://paystack.com/docs/api/transaction#verify
- Webhooks: https://paystack.com/docs/payments/webhooks/
- Test credentials for mobile money: https://paystack.com/docs/payments/test-payments/#mobile-money

## 3. Final file tree

```
src/
├── main.ts                                        # edited: rawBody + request logging middleware
├── app.module.ts                                  # edited: imports PaymentsModule
├── common/
│   └── pipes/
│       └── zod-validation.pipe.ts                 # NEW
└── modules/
    ├── payments/                                  # gateway core (provider-agnostic)
    │   ├── payments.module.ts                     # NEW
    │   ├── payments.controller.ts                 # NEW
    │   ├── payments.service.ts                    # NEW
    │   ├── payments.store.ts                      # NEW (in-memory Map)
    │   ├── payments.types.ts                      # NEW (PaymentProvider interface + domain types)
    │   ├── payments.dto.ts                        # NEW (zod schemas for request DTOs)
    │   └── payments.utils.ts                      # NEW (phone normalization)
    └── paystack/                                  # everything Paystack in one module
        ├── paystack.module.ts                     # NEW
        ├── paystack.client.ts                     # NEW (HTTP calls to Paystack)
        ├── paystack.provider.ts                   # NEW (implements PaymentProvider)
        ├── paystack.types.ts                      # NEW (zod schemas for all Paystack payloads)
        ├── paystack-webhook.controller.ts         # NEW (POST /webhooks/paystack)
        └── paystack-webhook.service.ts            # NEW (signature verify + event handling)
```

Module dependency graph:

```
AppModule
 └── PaymentsModule ──imports──> PaystackModule ──imports──> HttpModule
       (controller, service,          (client, provider,        forwardRef(PaymentsModule)
        store)                         webhook controller/service)  for PaymentsStore access
```

`forwardRef` resolves the circular dependency: `PaymentsService` needs the Paystack provider; the Paystack webhook service needs `PaymentsStore` to correlate events.

## 4. API contract (what we expose)

| Method | Route                       | Purpose                                        |
| ------ | --------------------------- | ---------------------------------------------- |
| POST   | `/payments/mpesa/initiate`  | Start an M-Pesa STK push charge                |
| GET    | `/payments/:reference/status` | Verify/refresh a transaction's status        |
| POST   | `/webhooks/paystack`        | Receive Paystack events (signature-verified)   |

Request body for `POST /payments/mpesa/initiate`:

```json
{
  "amount": 100,
  "email": "customer@example.com",
  "phone": "0722000000",
  "metadata": { "order_id": "abc-123" }
}
```

- `amount`: KES in **major** units (we convert to minor units x100 before calling Paystack)
- `phone`: `07XXXXXXXX`, `2547XXXXXXXX` or `+2547XXXXXXXX` (normalized to `+254...`)
- `metadata`: optional, forwarded to Paystack

Response:

```json
{
  "reference": "8nn5fqljd0suybr",
  "channel": "MPESA_STK_PUSH",
  "status": "PENDING",
  "displayText": "Please complete authorization process on your mobile phone"
}
```

## 5. Conventions enforced throughout (from AGENTS.md)

- No comments anywhere in code.
- Explicit types on all parameters, return values, properties.
- No `any`, no `as` assertions, no non-null assertions, no `@ts-*` directives.
- Zod for all runtime validation (env values and upstream API responses included).
- Type-only imports where applicable (`import type`).
- Quality gates: `npm run build`, `npm run check`, `npm run stylecheck` must all exit 0.

---

## 6. Step-by-step implementation

### Step 0 — Install dependencies

Install the HTTP client packages (`@nestjs/axios` + its peer `axios`):

```bash
npm install @nestjs/axios axios
```

Zod is already installed (`^4.4.3`). Nothing else is needed.

**Verify:** `npm run build` still exits 0.

---

### Step 1 — Generic Zod validation pipe

Create `src/common/pipes/zod-validation.pipe.ts`. This is reusable for every future route/DTO.

```typescript
import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new BadRequestException(`Validation failed: ${details}`);
    }
    return result.data;
  }
}
```

---

### Step 2 — Payments domain types

Create `src/modules/payments/payments.types.ts`. This is the provider-agnostic contract every future provider implements.

```typescript
export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum PaymentChannel {
  MPESA_STK_PUSH = 'MPESA_STK_PUSH',
}

export interface InitiatePaymentInput {
  channel: PaymentChannel;
  amount: number;
  currency: string;
  email: string;
  phone: string;
  metadata?: Record<string, unknown>;
}

export interface InitiatePaymentResult {
  reference: string;
  channel: PaymentChannel;
  status: PaymentStatus;
  displayText: string;
}

export interface PaymentVerificationResult {
  reference: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  channel: string;
  gatewayResponse: string | null;
  paidAt: string | null;
}

export interface PaymentProvider {
  readonly channel: PaymentChannel;
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verify(reference: string): Promise<PaymentVerificationResult>;
}
```

---

### Step 3 — Request DTOs (zod)

Create `src/modules/payments/payments.dto.ts`.

```typescript
import { z } from 'zod';

export const initiateMpesaPaymentSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  email: z.email(),
  phone: z.string().regex(/^(?:\+?254|0)[17]\d{8}$/),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type InitiateMpesaPaymentDto = z.infer<typeof initiateMpesaPaymentSchema>;
```

The phone regex accepts Kenyan mobile numbers: `07XXXXXXXX`, `01XXXXXXXX`, with or without the `+254`/`254` prefix.

---

### Step 4 — Phone normalization utility

Create `src/modules/payments/payments.utils.ts`. Paystack recommends international format for M-Pesa STK push.

```typescript
export function normalizeKenyanPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('254')) {
    return `+${digits}`;
  }
  if (digits.startsWith('0')) {
    return `+254${digits.slice(1)}`;
  }
  return `+${digits}`;
}
```

---

### Step 5 — In-memory payments store

Create `src/modules/payments/payments.store.ts`. This replaces a database for now; swap for a repository implementation later without touching callers.

```typescript
import { Injectable } from '@nestjs/common';
import { PaymentChannel, PaymentStatus } from './payments.types';

export interface StoredPayment {
  reference: string;
  channel: PaymentChannel;
  status: PaymentStatus;
  amount: number;
  currency: string;
  email: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PaymentsStore {
  private readonly payments: Map<string, StoredPayment> = new Map();

  save(payment: StoredPayment): void {
    this.payments.set(payment.reference, payment);
  }

  findByReference(reference: string): StoredPayment | undefined {
    return this.payments.get(reference);
  }

  updateStatus(reference: string, status: PaymentStatus): StoredPayment | undefined {
    const existing = this.payments.get(reference);
    if (!existing) {
      return undefined;
    }
    const updated: StoredPayment = { ...existing, status, updatedAt: new Date() };
    this.payments.set(reference, updated);
    return updated;
  }
}
```

---

### Step 6 — Paystack payload types (zod)

Create `src/modules/paystack/paystack.types.ts`. Every payload going to or coming from Paystack is described here and validated at runtime — never trust upstream JSON.

```typescript
import { z } from 'zod';

export const paystackMobileMoneyProviderSchema = z.enum(['mpesa']);

export type PaystackMobileMoneyProvider = z.infer<typeof paystackMobileMoneyProviderSchema>;

export const paystackChargeRequestSchema = z.object({
  email: z.email(),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  mobile_money: z.object({
    phone: z.string().min(9),
    provider: paystackMobileMoneyProviderSchema,
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PaystackChargeRequest = z.infer<typeof paystackChargeRequestSchema>;

export const paystackChargeResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.object({
    reference: z.string(),
    status: z.string(),
    display_text: z.string().optional(),
  }),
});

export type PaystackChargeResponse = z.infer<typeof paystackChargeResponseSchema>;

export const paystackVerifyTransactionResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.object({
    reference: z.string(),
    status: z.string(),
    amount: z.number(),
    currency: z.string(),
    channel: z.string(),
    gateway_response: z.string().nullish(),
    paid_at: z.string().nullish(),
  }),
});

export type PaystackVerifyTransactionResponse = z.infer<
  typeof paystackVerifyTransactionResponseSchema
>;

export const paystackWebhookEventSchema = z.object({
  event: z.string(),
  data: z.object({
    reference: z.string(),
    status: z.string(),
    amount: z.number(),
    currency: z.string(),
    channel: z.string(),
    gateway_response: z.string().nullish(),
    paid_at: z.string().nullish(),
  }),
});

export type PaystackWebhookEvent = z.infer<typeof paystackWebhookEventSchema>;

export const paystackErrorResponseSchema = z.object({
  status: z.boolean().optional(),
  message: z.string().optional(),
});

export type PaystackErrorResponse = z.infer<typeof paystackErrorResponseSchema>;

export interface WebhookAcknowledgement {
  received: boolean;
}
```

---

### Step 7 — Paystack HTTP client

Create `src/modules/paystack/paystack.client.ts`. Wraps `HttpService`, attaches the Bearer secret key, and validates every response with zod. All upstream/network failures are mapped to `502 Bad Gateway`.

```typescript
import { BadGatewayException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import type { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import type { ZodType } from 'zod';
import type { PaystackEnvironment } from '../../config/env.types';
import {
  paystackChargeRequestSchema,
  paystackChargeResponseSchema,
  paystackErrorResponseSchema,
  paystackVerifyTransactionResponseSchema,
  type PaystackChargeRequest,
  type PaystackChargeResponse,
  type PaystackVerifyTransactionResponse,
} from './paystack.types';

@Injectable()
export class PaystackClient {
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  charge(body: PaystackChargeRequest): Promise<PaystackChargeResponse> {
    paystackChargeRequestSchema.parse(body);
    return this.request('post', '/charge', paystackChargeResponseSchema, body);
  }

  verifyTransaction(reference: string): Promise<PaystackVerifyTransactionResponse> {
    return this.request(
      'get',
      `/transaction/verify/${reference}`,
      paystackVerifyTransactionResponseSchema,
    );
  }

  private async request<T>(
    method: 'get' | 'post',
    path: string,
    schema: ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        method === 'post'
          ? this.httpService.post<unknown>(
              `${this.baseUrl}${path}`,
              body,
              this.buildRequestConfig(),
            )
          : this.httpService.get<unknown>(`${this.baseUrl}${path}`, this.buildRequestConfig()),
      );
      return schema.parse(response.data);
    } catch (error: unknown) {
      throw this.toHttpException(error);
    }
  }

  private buildRequestConfig(): AxiosRequestConfig {
    const secretKey =
      this.configService.getOrThrow<PaystackEnvironment['secretKey']>('secretKey');
    return { headers: { Authorization: `Bearer ${secretKey}` } };
  }

  private toHttpException(error: unknown): BadGatewayException {
    if (isAxiosError(error)) {
      const parsed = paystackErrorResponseSchema.safeParse(error.response?.data);
      const upstreamMessage =
        parsed.success && parsed.data.message ? parsed.data.message : 'Paystack request failed';
      return new BadGatewayException(upstreamMessage);
    }
    return new BadGatewayException('Paystack request failed');
  }
}
```

Notes:

- The secret key comes from the typed config (`paystackConfig` loaded in `ConfigModule.forRoot`), never from raw `process.env`.
- Responses are parsed as `unknown` then narrowed by zod — no `any` anywhere.

---

### Step 8 — Paystack provider

Create `src/modules/paystack/paystack.provider.ts`. Adapts Paystack to the generic `PaymentProvider` contract.

```typescript
import { Injectable } from '@nestjs/common';
import {
  PaymentChannel,
  PaymentStatus,
  type InitiatePaymentInput,
  type InitiatePaymentResult,
  type PaymentProvider,
  type PaymentVerificationResult,
} from '../payments/payments.types';
import { PaystackClient } from './paystack.client';
import type { PaystackChargeRequest } from './paystack.types';

const DEFAULT_DISPLAY_TEXT = 'Please complete authorization process on your mobile phone';

@Injectable()
export class PaystackProvider implements PaymentProvider {
  readonly channel: PaymentChannel = PaymentChannel.MPESA_STK_PUSH;

  constructor(private readonly client: PaystackClient) {}

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const chargeRequest: PaystackChargeRequest = {
      email: input.email,
      amount: Math.round(input.amount * 100),
      currency: input.currency,
      mobile_money: { phone: input.phone, provider: 'mpesa' },
    };
    if (input.metadata) {
      chargeRequest.metadata = input.metadata;
    }

    const response = await this.client.charge(chargeRequest);

    return {
      reference: response.data.reference,
      channel: this.channel,
      status: this.mapStatus(response.data.status),
      displayText: response.data.display_text ?? DEFAULT_DISPLAY_TEXT,
    };
  }

  async verify(reference: string): Promise<PaymentVerificationResult> {
    const response = await this.client.verifyTransaction(reference);

    return {
      reference: response.data.reference,
      status: this.mapStatus(response.data.status),
      amount: response.data.amount / 100,
      currency: response.data.currency,
      channel: response.data.channel,
      gatewayResponse: response.data.gateway_response ?? null,
      paidAt: response.data.paid_at ?? null,
    };
  }

  private mapStatus(status: string): PaymentStatus {
    if (status === 'success') {
      return PaymentStatus.SUCCESS;
    }
    if (status === 'failed') {
      return PaymentStatus.FAILED;
    }
    return PaymentStatus.PENDING;
  }
}
```

Notes:

- Paystack amounts are in **minor units**; ours are major, hence `* 100` on the way out and `/ 100` on the way back.
- A charge response with `data.status: "pay_offline"` maps to `PENDING`.

---

### Step 9 — Webhook service (signature verification + event handling)

Create `src/modules/paystack/paystack-webhook.service.ts`.

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaystackEnvironment } from '../../config/env.types';
import { AppLogger } from '../../logger/winston.logger';
import { PaymentsStore } from '../payments/payments.store';
import { PaymentStatus } from '../payments/payments.types';
import { paystackWebhookEventSchema } from './paystack.types';

@Injectable()
export class PaystackWebhookService {
  constructor(
    private readonly configService: ConfigService,
    private readonly store: PaymentsStore,
    private readonly logger: AppLogger,
  ) {}

  isSignatureValid(rawBody: Buffer, signature: string): boolean {
    const secretKey =
      this.configService.getOrThrow<PaystackEnvironment['secretKey']>('secretKey');
    const expected = createHmac('sha512', secretKey).update(rawBody).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const actualBuffer = Buffer.from(signature, 'utf8');
    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }
    return timingSafeEqual(expectedBuffer, actualBuffer);
  }

  handleEvent(payload: unknown): void {
    const parsed = paystackWebhookEventSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn('Received unrecognized Paystack webhook event');
      return;
    }

    const event = parsed.data;
    this.logger.info('Received Paystack webhook event', {
      event: event.event,
      reference: event.data.reference,
    });

    if (event.event !== 'charge.success') {
      return;
    }

    const updated = this.store.updateStatus(event.data.reference, PaymentStatus.SUCCESS);
    if (!updated) {
      this.logger.warn('Webhook received for unknown payment reference', {
        reference: event.data.reference,
      });
    }
  }
}
```

Notes:

- Signature = HMAC-SHA512 of the **raw request body**, keyed with the secret key, compared with `timingSafeEqual` to avoid timing attacks.
- Paystack does not send a failure event for mobile money; failures surface via the verify endpoint (`GET /payments/:reference/status`).

---

### Step 10 — Webhook controller

Create `src/modules/paystack/paystack-webhook.controller.ts`. Requires raw body access, enabled both in `main.ts` (app level) and on this controller.

```typescript
import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WebhookAcknowledgement } from './paystack.types';
import { PaystackWebhookService } from './paystack-webhook.service';

@Controller({ path: 'webhooks/paystack', rawBody: true })
export class PaystackWebhookController {
  constructor(private readonly webhookService: PaystackWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string | undefined,
  ): WebhookAcknowledgement {
    const rawBody = request.rawBody;
    if (!rawBody || !signature || !this.webhookService.isSignatureValid(rawBody, signature)) {
      throw new UnauthorizedException('Invalid Paystack webhook signature');
    }

    const payload: unknown = JSON.parse(rawBody.toString('utf8'));
    this.webhookService.handleEvent(payload);
    return { received: true };
  }
}
```

Notes:

- `@HttpCode(HttpStatus.OK)` — POST defaults to 201; Paystack expects `200 OK` to acknowledge the event, otherwise it retries (test mode: hourly for 10 hours; live: every 3 min x4, then hourly for 72 hours).
- Keep the handler fast: acknowledge immediately, no long-running work.

---

### Step 11 — Paystack module

Create `src/modules/paystack/paystack.module.ts`.

```typescript
import { forwardRef, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaymentsModule } from '../payments/payments.module';
import { PaystackClient } from './paystack.client';
import { PaystackProvider } from './paystack.provider';
import { PaystackWebhookController } from './paystack-webhook.controller';
import { PaystackWebhookService } from './paystack-webhook.service';

@Module({
  imports: [HttpModule, forwardRef(() => PaymentsModule)],
  controllers: [PaystackWebhookController],
  providers: [PaystackClient, PaystackProvider, PaystackWebhookService],
  exports: [PaystackProvider],
})
export class PaystackModule {}
```

---

### Step 12 — Payments service

Create `src/modules/payments/payments.service.ts`. Orchestrates: validate → normalize → call provider → store the record.

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { AppLogger } from '../../logger/winston.logger';
import { PaystackProvider } from '../paystack/paystack.provider';
import type { InitiateMpesaPaymentDto } from './payments.dto';
import { PaymentsStore } from './payments.store';
import {
  PaymentChannel,
  type InitiatePaymentInput,
  type InitiatePaymentResult,
  type PaymentVerificationResult,
} from './payments.types';
import { normalizeKenyanPhone } from './payments.utils';

const MPESA_CURRENCY = 'KES';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paystackProvider: PaystackProvider,
    private readonly store: PaymentsStore,
    private readonly logger: AppLogger,
  ) {}

  async initiateMpesaPayment(dto: InitiateMpesaPaymentDto): Promise<InitiatePaymentResult> {
    const input: InitiatePaymentInput = {
      channel: PaymentChannel.MPESA_STK_PUSH,
      amount: dto.amount,
      currency: MPESA_CURRENCY,
      email: dto.email,
      phone: normalizeKenyanPhone(dto.phone),
    };
    if (dto.metadata) {
      input.metadata = dto.metadata;
    }

    const result = await this.paystackProvider.initiate(input);

    this.store.save({
      reference: result.reference,
      channel: result.channel,
      status: result.status,
      amount: dto.amount,
      currency: MPESA_CURRENCY,
      email: dto.email,
      phone: input.phone,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.logger.info('M-Pesa STK push initiated', { reference: result.reference });
    return result;
  }

  async getPaymentStatus(reference: string): Promise<PaymentVerificationResult> {
    const stored = this.store.findByReference(reference);
    if (!stored) {
      throw new NotFoundException(`Payment with reference ${reference} not found`);
    }

    const verification = await this.paystackProvider.verify(reference);
    this.store.updateStatus(reference, verification.status);
    return verification;
  }
}
```

---

### Step 13 — Payments controller

Create `src/modules/payments/payments.controller.ts`.

```typescript
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { initiateMpesaPaymentSchema, type InitiateMpesaPaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';
import type { InitiatePaymentResult, PaymentVerificationResult } from './payments.types';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('mpesa/initiate')
  initiateMpesaPayment(
    @Body(new ZodValidationPipe(initiateMpesaPaymentSchema)) body: InitiateMpesaPaymentDto,
  ): Promise<InitiatePaymentResult> {
    return this.paymentsService.initiateMpesaPayment(body);
  }

  @Get(':reference/status')
  getPaymentStatus(@Param('reference') reference: string): Promise<PaymentVerificationResult> {
    return this.paymentsService.getPaymentStatus(reference);
  }
}
```

---

### Step 14 — Payments module

Create `src/modules/payments/payments.module.ts`.

```typescript
import { Module } from '@nestjs/common';
import { PaystackModule } from '../paystack/paystack.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsStore } from './payments.store';

@Module({
  imports: [PaystackModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsStore],
  exports: [PaymentsStore],
})
export class PaymentsModule {}
```

`PaymentsStore` is exported so the Paystack webhook service can reach it through the `forwardRef` import.

---

### Step 15 — Wire into AppModule

Edit `src/app.module.ts` — add `PaymentsModule` to imports:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { globalConfig, paystackConfig } from './config/env.config';
import { AppLoggerModule } from './logger/logger.module';
import { PaymentsModule } from './modules/payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [globalConfig, paystackConfig],
      isGlobal: true,
    }),
    AppLoggerModule,
    PaymentsModule,
  ],
})
export class AppModule {}
```

---

### Step 16 — Update main.ts (raw body + request logging)

Edit `src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { globalConfig } from './config/env.config';
import { logger } from './logger/winston.logger';

const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startedAt = Date.now();
  logger.logAPIStart(req);
  res.on('finish', () => {
    logger.logAPIRequest(req, res, Date.now() - startedAt);
  });
  next();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(requestLoggingMiddleware);
  const { port } = globalConfig();
  await app.listen(port);
}

void bootstrap();
```

- `rawBody: true` is required for webhook signature verification (`request.rawBody`).
- The logging middleware wires the existing `AppLogger` helpers that were previously unused.

---

### Step 17 — Environment check

No config changes are needed: `PAYSTACK_SECRET_KEY_*` and `PAYSTACK_PUBLIC_KEY_*` already exist in the schema and `.env.example`. Confirm your own `.env` has real **test** keys (`sk_test_...`, `pk_test_...`) set for `PAYSTACK_SECRET_KEY_DEVELOPMENT` / `PAYSTACK_PUBLIC_KEY_DEVELOPMENT`. (Agents must not touch `.env` — this is a manual user step.)

---

### Step 18 — Quality gates

Run and ensure all exit 0:

```bash
npm run build
npm run check
npm run stylecheck
```

Fix issues at the root cause; never disable lint rules or loosen tsconfig.

---

### Step 19 — Smoke test

Start the dev server:

```bash
npm run start:dev
```

**1. Initiate an STK push** (requires test keys in `.env`):

```bash
curl -X POST http://localhost:3000/payments/mpesa/initiate \
  -H 'Content-Type: application/json' \
  -d '{"amount": 1, "email": "customer@example.com", "phone": "0722000000"}'
```

Expected: `201` with `{ reference, channel: "MPESA_STK_PUSH", status: "PENDING", displayText }`.

**2. Check status** (poll fallback, use the returned reference):

```bash
curl http://localhost:3000/payments/<reference>/status
```

Expected: `200` with the normalized verification result. `PENDING` until the customer approves; `FAILED` after the 180s window.

**3. Simulate a signed webhook locally** (proves signature verification works without a public URL):

```bash
BODY='{"event":"charge.success","data":{"reference":"<reference>","status":"success","amount":100,"currency":"KES","channel":"mobile_money","gateway_response":"Approved","paid_at":"2026-08-12T10:00:00.000Z"}}'
SIGNATURE=$(printf '%s' "$BODY" | openssl dgst -sha512 -hmac "YOUR_TEST_SECRET_KEY" | awk '{print $NF}')
curl -X POST http://localhost:3000/webhooks/paystack \
  -H 'Content-Type: application/json' \
  -H "x-paystack-signature: $SIGNATURE" \
  -d "$BODY"
```

Expected: `200 {"received":true}`. With a wrong signature: `401`.

**4. Real end-to-end (optional):** expose localhost (`ngrok http 3000`), register `https://<your-subdomain>/webhooks/paystack` in the Paystack dashboard (Settings → Developer → Webhook URL), use the official mobile money test credentials from https://paystack.com/docs/payments/test-payments/#mobile-money, initiate a charge and approve the STK prompt with the test PIN.

---

## 7. Milestones

| # | Milestone                             | Steps  | Verification                                                              |
| - | ------------------------------------- | ------ | ------------------------------------------------------------------------- |
| 1 | Dependencies installed                | 0      | `npm run build` exits 0                                                    |
| 2 | Shared validation infra               | 1      | `npm run build` exits 0                                                    |
| 3 | Payments core (types, DTO, utils, store) | 2–5 | `npm run build` exits 0                                                    |
| 4 | Paystack client + provider            | 6–8    | `npm run build` exits 0                                                    |
| 5 | Webhook (service + controller)        | 9–11   | `npm run build` exits 0                                                    |
| 6 | Wiring complete, all gates green      | 12–18  | `npm run build` + `npm run check` + `npm run stylecheck` all exit 0        |
| 7 | End-to-end smoke test                 | 19     | curl scenarios above behave as expected with Paystack test keys            |

## 8. Extending later

- **New M-Pesa variants** (`mpesa_offline`, `mptill`): extend `paystackMobileMoneyProviderSchema`, add DTO fields, add channels to `PaymentChannel`.
- **New provider** (e.g. Flutterwave): create `src/modules/<provider>/` implementing `PaymentProvider` from `payments.types.ts`; `PaymentsService` selects the provider by channel (introduce a provider registry when there are 2+).
- **Database**: replace `PaymentsStore` internals (or inject a repository behind it); nothing else changes.
