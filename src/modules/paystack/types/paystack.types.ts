import { z } from 'zod';
import { type ApiResponse } from 'src/types/api.types';

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum PaymentChannel {
  MPESA_STK_PUSH = 'MPESA_STK_PUSH',
}

export const initiateMpesaPaymentSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  email: z.email(),
  phone: z.string().regex(/^(?:\+?254|0)[17]\d{8}$/),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type InitiateMpesaPaymentDto = z.infer<typeof initiateMpesaPaymentSchema>;

export interface InitiateMpesaPaymentResult {
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

export type InitiateMpesaStkPushApiResponse = ApiResponse<InitiateMpesaPaymentResult>;

export type PaymentStatusApiResponse = ApiResponse<PaymentVerificationResult>;
