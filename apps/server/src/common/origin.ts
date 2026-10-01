import type { Request } from 'express';

/** İsteğin kaynağı: Origin başlığı, yoksa Referer'ın kökeni */
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

/**
 * Kaynak, isteğin geldiği sunucuyla (Host başlığı) aynıysa o kökeni döner. Tarayıcılar başka bir siteden
 * gönderilen istekte Host'u hedef sunucu, Origin'i kendi adresi olarak yazar; bu yüzden eşleşme siteler arası
 * isteği dışarıda bırakır. Yalnızca site adresi henüz bilinmezken (otomatik APP_URL, kurulumdan önce) kullanılır.
 */
export function requestOrigin(source: string | undefined, host: string | undefined): string | null {
  if (!source || !host) return null;
  try {
    const url = new URL(source);
    return url.host === host.toLowerCase() ? url.origin : null;
  } catch {
    return null;
  }
}
