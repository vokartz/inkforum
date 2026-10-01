import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger, Optional } from '@nestjs/common';
import type { Request, Response } from 'express';
import { I18nService } from '../i18n/i18n.service.js';
import { ErrorCode, type ApiErrorBody } from '@forum/shared';
import { AppError } from './errors.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  constructor(@Optional() private readonly i18n?: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const [status, body] = this.toBody(exception);
    this.localize(req, body);
    // Bilinçli 503'ler (bakım modu, kurulum bekleniyor) hata değildir
    const expected = body.error.code === 'MAINTENANCE' || body.error.code === 'INSTALL_REQUIRED';
    if (status >= 500 && !expected) this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : exception);
    if (res.headersSent) return;
    if (status === 429 && body.error.details?.retryAfter) {
      res.setHeader('Retry-After', String(body.error.details.retryAfter));
    }
    res.status(status).json(body);
  }

  /** Hata metinlerini isteğin diline çevirir (kaynak metinler Türkçe) */
  private localize(req: Request, body: ApiErrorBody): void {
    if (!this.i18n) return;
    const locale = req.viewer?.locale ?? this.i18n.resolve({ cookie: req.headers?.cookie, acceptLanguage: req.headers?.['accept-language'] });
    if (locale === 'tr') return;
    body.error.message = this.i18n.message(locale, body.error.message);
    if (body.error.fields) for (const k of Object.keys(body.error.fields)) body.error.fields[k] = this.i18n.message(locale, body.error.fields[k]!);
  }

  private toBody(exception: unknown): [number, ApiErrorBody] {
    if (exception instanceof AppError) {
      return [
        exception.status,
        {
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.fields ? { fields: exception.fields } : {}),
            ...(exception.details ? { details: exception.details } : {}),
          },
        },
      ];
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        status === 404
          ? ErrorCode.NOT_FOUND
          : status === 401
            ? ErrorCode.UNAUTHENTICATED
            : status === 403
              ? ErrorCode.FORBIDDEN
              : status === 413
                ? ErrorCode.VALIDATION
                : status >= 500
                  ? ErrorCode.INTERNAL
                  : ErrorCode.VALIDATION;
      const message =
        status === 404
          ? 'İstenen adres bulunamadı.'
          : status === 413
            ? 'Gönderilen dosya veya veri çok büyük.'
            : exception.message;
      return [status, { error: { code, message } }];
    }
    const maybe = exception as { type?: string; status?: number };
    if (maybe?.type === 'entity.parse.failed') {
      return [400, { error: { code: ErrorCode.VALIDATION, message: 'Geçersiz JSON gövdesi.' } }];
    }
    if (maybe?.type === 'entity.too.large') {
      return [413, { error: { code: ErrorCode.VALIDATION, message: 'Gönderilen veri çok büyük.' } }];
    }
    return [500, { error: { code: ErrorCode.INTERNAL, message: 'Beklenmeyen bir hata oluştu.' } }];
  }
}
