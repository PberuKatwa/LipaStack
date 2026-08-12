import {
  globalEnvironmentSchema,
  paystackEnvironmentSchema,
  type GlobalEnvironmentChecker,
  type GetEnv,
  type GlobalEnvironment,
  type PaystackEnvironment,
} from './env.types';
import { parseEnvZod } from './env.utils';

const getGlobalEnvironment: GlobalEnvironmentChecker = function (): string {
  const env = process.env.ENVIRONMENT;
  if (!env) throw new Error(`No environmet was found`);

  return env;
};

const getEnv: GetEnv = function (globalEnvCallback: GlobalEnvironmentChecker, key: string): string {
  const global = globalEnvCallback();
  const combinedKey = `${key}_${global}`;
  const env = process.env[combinedKey];

  if (!env) throw new Error(`No env for key:${key} was found`);
  return env;
};

export const globalConfig = (): GlobalEnvironment =>
  parseEnvZod(
    globalEnvironmentSchema,
    {
      environment: getGlobalEnvironment(),
      port: getEnv(getGlobalEnvironment, 'PORT'),
    },
    'global',
  );

export const paystackConfig = (): PaystackEnvironment =>
  parseEnvZod(
    paystackEnvironmentSchema,
    {
      secretKey: getEnv(getGlobalEnvironment, 'PAYSTACK_SECRET_KEY'),
      publicKey: getEnv(getGlobalEnvironment, 'PAYSTACK_PUBLIC_KEY'),
    },
    'paystack',
  );
