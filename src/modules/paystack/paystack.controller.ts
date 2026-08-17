import { Controller, Post, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppLogger } from 'src/logger/winston.logger';
import { type ApiResponse } from 'src/types/api.types';
import {
  type InitiateMpesaStkPushApiResponse,
  type PaymentStatusApiResponse,
} from './types/paystack.types';
import { PaystackService } from './paystack.service';

@Controller('paystack')
export class PaystackController {
  constructor(
    private readonly logger: AppLogger,
    private readonly paystackService: PaystackService,
  ) {}

  @Post('mpesa/stk-push')
  async initiateMpesaStkPush(@Req() req: Request, @Res() res: Response): Promise<Response> {
    try {
      const payload: unknown = req.body;

      const result = await this.paystackService.initiateMpesaStkPush(payload);

      const response: InitiateMpesaStkPushApiResponse = {
        success: true,
        message: `Successfully initiated mpesa stk push`,
        data: result,
      };

      return res.status(200).json(response);
    } catch (error) {
      this.logger.error(`Error initiating mpesa stk push`, { error });

      const response: ApiResponse = {
        success: false,
        message: `${error}`,
      };

      return res.status(500).json(response);
    }
  }

  @Get('payments/:reference/status')
  async fetchPaymentStatus(@Req() req: Request, @Res() res: Response): Promise<Response> {
    try {
      const referenceParam = req.params.reference;
      const reference = Array.isArray(referenceParam) ? referenceParam[0] : referenceParam;

      if (reference === undefined) {
        const response: ApiResponse = {
          success: false,
          message: `Payment reference is required`,
        };

        return res.status(400).json(response);
      }

      const result = await this.paystackService.getPaymentStatus(reference);

      const response: PaymentStatusApiResponse = {
        success: true,
        message: `Successfully fetched payment status`,
        data: result,
      };

      return res.status(200).json(response);
    } catch (error) {
      this.logger.error(`Error fetching payment status`, { error });

      const response: ApiResponse = {
        success: false,
        message: `${error}`,
      };

      return res.status(500).json(response);
    }
  }
}
