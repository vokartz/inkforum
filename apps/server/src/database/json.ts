import type { z } from 'zod';

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJson<T>(text: string | null | undefined, fallback: T): T {
  if (text == null || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function fromJsonSchema<S extends z.ZodType>(schema: S, text: string | null | undefined, fallback: z.output<S>): z.output<S> {
  const raw = fromJson<unknown>(text, undefined);
  if (raw === undefined) return fallback;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : fallback;
}

export const bool = (v: number | boolean | null | undefined): boolean => v === 1 || v === true;
