import { error, redirect } from '@sveltejs/kit';
import { isApiErrorBody } from '@forum/shared';
import { t } from '$lib/i18n.svelte';

type Fetch = typeof fetch;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    if (isApiErrorBody(body)) {
      // Güvenlik duvarı doğrulama istiyor (ör. doğrulama süresi doldu): sayfa yenilenince doğrulama sayfası açılır
      if (body.error.code === 'WAF_CHALLENGE' && typeof window !== 'undefined') window.location.reload();
      // Kurulum tamamlanmamış: sihirbaza git
      if (body.error.code === 'INSTALL_REQUIRED' && typeof window !== 'undefined' && !window.location.pathname.startsWith('/install')) window.location.href = '/install';
      throw new ApiError(res.status, body.error.code, body.error.message, body.error.fields ?? {}, body.error.details ?? {});
    }
    throw new ApiError(res.status, 'INTERNAL', res.status === 502 || res.status === 503 ? t('Sunucuya ulaşılamıyor.') : t('Beklenmeyen bir hata oluştu.'));
  }
  return body as T;
}

export async function request<T>(fetchFn: Fetch, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  headers.set('accept', 'application/json');
  let res: Response;
  try {
    res = await fetchFn(path, { ...init, headers, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'NETWORK', t('Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.'));
  }
  return parse<T>(res);
}

/**
 * Sayfa yükleyicileri için: API hatalarını SvelteKit hatalarına/yönlendirmelerine çevirir.
 */
export async function load<T>(fetchFn: Fetch, path: string, url?: URL): Promise<T> {
  try {
    return await request<T>(fetchFn, path);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.status === 401 || e.code === 'UNAUTHENTICATED') {
      const next = url ? `?next=${encodeURIComponent(url.pathname + url.search)}` : '';
      redirect(303, `/login${next}`);
    }
    if (e.code === 'POLICY_ACCEPTANCE_REQUIRED') redirect(303, '/policies/accept');
    if (e.code === 'PASSWORD_CHANGE_REQUIRED') redirect(303, '/change-password');
    if (e.code === 'TWO_FACTOR_SETUP_REQUIRED') redirect(303, '/settings/security?required=1');
    error(e.status || 500, { message: e.message, code: e.code, details: e.details });
  }
}

/** Tarayıcıda yapılan değişiklik istekleri (giriş, kayıt, kaydetme…). */
export const api = {
  get: <T = unknown>(path: string) => request<T>(fetch, path),
  post: <T = unknown>(path: string, body: unknown = {}) => request<T>(fetch, path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T = unknown>(path: string, body: unknown = {}) => request<T>(fetch, path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T = unknown>(path: string, body: unknown = {}) => request<T>(fetch, path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = unknown>(path: string) => request<T>(fetch, path, { method: 'DELETE' }),
  upload: <T = unknown>(path: string, file: Blob, filename = 'file') => {
    const form = new FormData();
    form.append('file', file, filename);
    return request<T>(fetch, path, { method: 'POST', body: form });
  },
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return t('Beklenmeyen bir hata oluştu.');
}
