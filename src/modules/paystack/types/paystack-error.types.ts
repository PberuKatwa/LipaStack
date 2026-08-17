import { z } from 'zod';

export const paystackErrorTypeSchema = z.enum(['api_error', 'validation_error', 'processor_error']);

export const paystackErrorMetaSchema = z
  .object({
    nextStep: z.string().optional(),
    next_step: z.string().optional(),
  })
  .catchall(z.unknown());

export const paystackErrorResponseSchema = z.object({
  status: z.literal(false),
  message: z.string(),
  type: paystackErrorTypeSchema.optional(),
  code: z.string().optional(),
  meta: paystackErrorMetaSchema.optional(),
  data: z.unknown().optional(),
});

export type PaystackErrorResponse = z.infer<typeof paystackErrorResponseSchema>;
export type PaystackErrorType = z.infer<typeof paystackErrorTypeSchema>;
