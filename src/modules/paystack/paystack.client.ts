import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, type AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import { type PaystackEnvironment } from 'src/config/env.types';
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

@Injectable()
export class PaystackClient {
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private buildAuthConfig(): AxiosRequestConfig {
    const secretKey = this.configService.getOrThrow<PaystackEnvironment['secretKey']>('secretKey');
    return { headers: { Authorization: `Bearer ${secretKey}` } };
  }

  private async request<T>(
    method: 'get' | 'post',
    path: string,
    schema: ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const authConfig = this.buildAuthConfig();
    const request =
      method === 'post'
        ? this.httpService.post<unknown>(`${this.baseUrl}${path}`, body, authConfig)
        : this.httpService.get<unknown>(`${this.baseUrl}${path}`, authConfig);

    try {
      const response = await firstValueFrom(request);
      return parseWithSchema(schema, response.data, 'Paystack API response');
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        if (error.response !== undefined) {
          throw createPaystackError(error.response.status, error.response.data);
        }
        if (error.request !== undefined) {
          throw new PaystackNetworkError('Network error reaching Paystack', error);
        }
      }
      throw error;
    }
  }

  initiateCharge(body: PaystackChargeRequest): Promise<PaystackChargeResponse> {
    return this.request('post', '/charge', paystackChargeResponseSchema, body);
  }

  verifyTransaction(reference: string): Promise<PaystackVerifyTransactionResponse> {
    return this.request(
      'get',
      `/transaction/verify/${reference}`,
      paystackVerifyTransactionResponseSchema,
    );
  }
}
