import type { Request } from 'express';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name || name in out) continue;
    let value = part.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

let internalToken: string | null = null;

/** SSR'ın iç soket üzerinden yaptığı istekleri tanımak için process'e özel rastgele anahtar. */
export function setInternalToken(token: string): void {
  internalToken = token;
}

export const INTERNAL_TOKEN_HEADER = 'x-forum-internal';
export const INTERNAL_IP_HEADER = 'x-forum-client-ip';

/** SSR'ın iç soket üzerinden yaptığı istek mi (güvenlik duvarı bunları denetlemez) */
export function isInternalRequest(req: Request): boolean {
  return !!internalToken && req.headers[INTERNAL_TOKEN_HEADER] === internalToken;
}

export function clientIp(req: Request): string | null {
  if (internalToken && req.headers[INTERNAL_TOKEN_HEADER] === internalToken) {
    const forwarded = req.headers[INTERNAL_IP_HEADER];
    if (typeof forwarded === 'string' && forwarded) return forwarded.startsWith('::ffff:') ? forwarded.slice(7) : forwarded;
  }
  const ip = req.ip ?? req.socket?.remoteAddress ?? null;
  if (!ip) return null;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function userAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 500) : null;
}

/** Kullanıcı ajanından okunabilir kısa bir cihaz etiketi çıkarır. */
export function deviceLabel(ua: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  if (!browser && !os) return null;
  return [browser, os].filter(Boolean).join(' · ');
}
