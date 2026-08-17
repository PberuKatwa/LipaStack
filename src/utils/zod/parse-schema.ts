import { type ZodType } from 'zod';

export function parseWithSchema<T>(schema: ZodType<T>, value: unknown, errorPrefix: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`${errorPrefix}: ${details}`);
  }
  return result.data;
}
