import type { Request } from 'express';

export function requestSource(req: Request): string | undefined {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin !== 'null') return origin;
  if (typeof req.headers.referer === 'string') {
    try {
      return new URL(req.headers.referer).origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function requestOrigin(source: string | undefined, host: string | undefined): string | null {
  if (!source || !host) return null;
  try {
    const url = new URL(source);
    return url.host === host.toLowerCase() ? url.origin : null;
  } catch {
    return null;
  }
}
