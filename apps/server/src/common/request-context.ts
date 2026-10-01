import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Row } from '@forum/db';

/** Her istekte middleware tarafından doldurulan kimlik bağlamı. */
export interface RequestViewer {
  user: Row<'users'> | null;
  session: Row<'sessions'> | null;
  groupIds: number[];
  permissions: Set<string>;
  isAdmin: boolean;
  ip: string | null;
  userAgent: string | null;
  /** Arayüz / yanıt dili (üye tercihi → çerez → tarayıcı → varsayılan) */
  locale?: import('@forum/shared').Locale;
  /** `Authorization: Bearer` ile gelen istek (OAuth erişim belirteci ya da API anahtarı). Çerez oturumu yoktur. */
  token?: { kind: 'oauth' | 'apikey'; id: number; clientId: number | null; scopes: Set<string> } | null;
  /** Bearer başlığı vardı ama geçersiz / süresi dolmuş */
  tokenError?: boolean;
}

export interface AuthedViewer extends RequestViewer {
  user: Row<'users'>;
  session: Row<'sessions'>;
}

declare module 'express' {
  interface Request {
    viewer?: RequestViewer;
  }
}

export function viewerOf(req: Request): RequestViewer {
  if (!req.viewer) throw new Error('İstek bağlamı oluşturulmamış.');
  return req.viewer;
}

/** Controller parametresi: `@CurrentViewer() viewer: RequestViewer` */
export const CurrentViewer = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  viewerOf(ctx.switchToHttp().getRequest<Request>()),
);

export function can(viewer: RequestViewer, permission: string): boolean {
  return viewer.isAdmin || viewer.permissions.has(permission);
}
