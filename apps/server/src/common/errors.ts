import { ErrorCode } from '@forum/shared';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status = 400,
    readonly fields?: Record<string, string>,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (fields: Record<string, string>, message = 'Lütfen formdaki hataları düzeltin.') =>
    new AppError(ErrorCode.VALIDATION, message, 422, fields),
  field: (field: string, message: string) => new AppError(ErrorCode.VALIDATION, message, 422, { [field]: message }),
  badRequest: (message: string) => new AppError(ErrorCode.VALIDATION, message, 400),
  unauthenticated: (message = 'Bu işlem için giriş yapmalısınız.') =>
    new AppError(ErrorCode.UNAUTHENTICATED, message, 401),
  forbidden: (message = 'Bu işlem için yetkiniz yok.') => new AppError(ErrorCode.FORBIDDEN, message, 403),
  notFound: (message = 'Aradığınız kayıt bulunamadı.') => new AppError(ErrorCode.NOT_FOUND, message, 404),
  conflict: (message: string, fields?: Record<string, string>) =>
    new AppError(ErrorCode.CONFLICT, message, 409, fields),
  rateLimited: (retryAfterSec?: number) =>
    new AppError(
      ErrorCode.RATE_LIMITED,
      'Çok fazla istek gönderdiniz. Lütfen biraz bekleyip tekrar deneyin.',
      429,
      undefined,
      retryAfterSec ? { retryAfter: retryAfterSec } : undefined,
    ),
  code: (code: ErrorCode, message: string, status = 400, details?: Record<string, unknown>) =>
    new AppError(code, message, status, undefined, details),
};
