import {
  paystackErrorResponseSchema,
  type PaystackErrorResponse,
  type PaystackErrorType,
} from './types/paystack-error.types';

export class PaystackError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly code?: string,
    readonly type?: PaystackErrorType,
    readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PaystackError';
  }
}

export class PaystackNetworkError extends PaystackError {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PaystackNetworkError';
  }
}

export function createPaystackError(statusCode: number, payload: unknown): PaystackError {
  const parsed = paystackErrorResponseSchema.safeParse(payload);
  const body: PaystackErrorResponse = parsed.success
    ? parsed.data
    : { status: false, message: 'Unexpected error response from Paystack' };
  const metaRecord = body.meta === undefined ? undefined : { ...body.meta };
  const isInfrastructureStatus = statusCode >= 500 || statusCode === 401 || statusCode === 404;
  const type: PaystackErrorType = isInfrastructureStatus ? 'api_error' : (body.type ?? 'api_error');

  return new PaystackError(body.message, statusCode, body.code, type, metaRecord);
}
