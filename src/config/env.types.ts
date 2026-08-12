import { z } from 'zod';

export const globalEnvironmentSchema = z.object({
  environment: z.enum(['DEVELOPMENT', 'PRODUCTION']),
  port: z.coerce.number().int().positive(),
});

export const paystackEnvironmentSchema = z.object({
  secretKey: z.string().min(1),
  publicKey: z.string().min(1),
});

export type GlobalEnvironment = z.infer<typeof globalEnvironmentSchema>;
export type PaystackEnvironment = z.infer<typeof paystackEnvironmentSchema>;

export type GlobalEnvironmentChecker = () => string;
export type GetEnv = (globalEnv: GlobalEnvironmentChecker, key: string) => string;
