import { Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { Errors } from './errors.js';

export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join('.') || '_';
    if (!fields[path]) fields[path] = issue.message;
  }
  return fields;
}

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw Errors.validation(zodFields(result.error));
  return result.data;
}

/** `@Body(new ZodPipe(schema))` */
@Injectable()
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    return parse(this.schema, value);
  }
}
