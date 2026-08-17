import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { type ZodType } from 'zod';
import { parseWithSchema } from '../../utils/zod/parse-schema';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    try {
      return parseWithSchema(this.schema, value, 'Validation failed');
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
