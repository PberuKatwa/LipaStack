import { Injectable } from '@nestjs/common';
import {
  HttpClient,
  HttpNetworkError,
  HttpResponseError,
  HttpTimeoutError,
  InjectHttpClient,
} from '@nestjs/http-client';
import { parseWithSchema } from 'src/utils/zod/parse-schema';
import { type ZodType } from 'zod';
import {
  type PaystackChargeRequest,
  type PaystackChargeResponse,
  paystackChargeResponseSchema,
  type PaystackVerifyTransactionResponse,
  paystackVerifyTransactionResponseSchema,
} from './types/paystack-client.types';
import { createPaystackError, PaystackNetworkError } from './paystack.errors';

interface PaystackRequestOptions {
  json?: unknown;
  params?: Record<string, string>;
}

@Injectable()
export class PaystackClient {
  constructor(@InjectHttpClient('paystack') private readonly httpClient: HttpClient) {}

  private async request<T>(
    method: 'get' | 'post',
    path: string,
    schema: ZodType<T>,
    options?: PaystackRequestOptions,
  ): Promise<T> {
    try {
      const response =
        method === 'post'
          ? await this.httpClient.post<unknown>(path, options)
          : await this.httpClient.get<unknown>(path, options);
      return parseWithSchema(schema, response.data, 'Paystack API response');
    } catch (error: unknown) {
      if (error instanceof HttpResponseError) {
        throw createPaystackError(error.status, error.body);
      }
      if (error instanceof HttpNetworkError || error instanceof HttpTimeoutError) {
        throw new PaystackNetworkError('Network error reaching Paystack', error);
      }
      throw error;
    }
  }

  initiateCharge(body: PaystackChargeRequest): Promise<PaystackChargeResponse> {
    return this.request('post', '/charge', paystackChargeResponseSchema, { json: body });
  }

  verifyTransaction(reference: string): Promise<PaystackVerifyTransactionResponse> {
    return this.request(
      'get',
      '/transaction/verify/:reference',
      paystackVerifyTransactionResponseSchema,
      { params: { reference } },
    );
  }
}
