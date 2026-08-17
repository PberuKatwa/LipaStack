import { Injectable } from '@nestjs/common';
import { AppLogger } from 'src/logger/winston.logger';
import { parseWithSchema } from 'src/utils/zod/parse-schema';
import { PaystackClient } from './paystack.client';
import { type PaystackChargeRequest } from './types/paystack-client.types';
import {
  type InitiateMpesaPaymentResult,
  initiateMpesaPaymentSchema,
  PaymentChannel,
  type PaymentVerificationResult,
} from './types/paystack.types';
import {
  convertAmountFromSubunit,
  convertAmountToSubunit,
  DEFAULT_DISPLAY_TEXT,
  mapPaystackStatus,
  MPESA_CURRENCY,
  normalizeKenyanPhone,
} from './paystack.utils';

@Injectable()
export class PaystackService {
  constructor(
    private readonly logger: AppLogger,
    private readonly paystackClient: PaystackClient,
  ) {}

  async initiateMpesaStkPush(payload: unknown): Promise<InitiateMpesaPaymentResult> {
    const parsedPayload = parseWithSchema(
      initiateMpesaPaymentSchema,
      payload,
      'Initiate Mpesa Request',
    );

    const chargeRequest: PaystackChargeRequest = {
      email: parsedPayload.email,
      amount: convertAmountToSubunit(parsedPayload.amount),
      currency: MPESA_CURRENCY,
      mobile_money: {
        phone: normalizeKenyanPhone(parsedPayload.phone),
        provider: 'mpesa',
      },
    };

    if (parsedPayload.metadata !== undefined) {
      chargeRequest.metadata = parsedPayload.metadata;
    }

    const response = await this.paystackClient.initiateCharge(chargeRequest);

    const result: InitiateMpesaPaymentResult = {
      reference: response.data.reference,
      channel: PaymentChannel.MPESA_STK_PUSH,
      status: mapPaystackStatus(response.data.status),
      displayText: response.data.display_text ?? DEFAULT_DISPLAY_TEXT,
    };

    this.logger.info('Successfully initiated mpesa stk push');
    return result;
  }

  async getPaymentStatus(reference: string): Promise<PaymentVerificationResult> {
    const response = await this.paystackClient.verifyTransaction(reference);

    return {
      reference: response.data.reference,
      status: mapPaystackStatus(response.data.status),
      amount: convertAmountFromSubunit(response.data.amount),
      currency: response.data.currency,
      channel: response.data.channel,
      gatewayResponse: response.data.gateway_response ?? null,
      paidAt: response.data.paid_at ?? null,
    };
  }
}
