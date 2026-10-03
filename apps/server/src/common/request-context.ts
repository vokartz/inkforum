import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Row } from '@forum/db';

export interface RequestViewer {
  user: Row<'users'> | null;
  session: Row<'sessions'> | null;
  groupIds: number[];
  permissions: Set<string>;
  isAdmin: boolean;
  ip: string | null;
  userAgent: string | null;
  locale?: import('@forum/shared').Locale;
  token?: { kind: 'oauth' | 'apikey'; id: number; clientId: number | null; scopes: Set<string> } | null;
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

export const CurrentViewer = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  viewerOf(ctx.switchToHttp().getRequest<Request>()),
);

export function can(viewer: RequestViewer, permission: string): boolean {
  return viewer.isAdmin || viewer.permissions.has(permission);
}
