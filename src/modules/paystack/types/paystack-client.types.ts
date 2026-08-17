import { z } from 'zod';

export const paystackMobileMoneyProviderSchema = z.enum([
  'mpesa',
  'mtn',
  'atl',
  'vod',
  'orange',
  'wave',
  'mpesa_offline',
  'mptill',
]);

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
