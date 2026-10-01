/** Yalnızca site içi göreli yönlendirmelere izin verir (açık yönlendirme saldırısını önler). */
export function safeNext(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/^\/(login|register|logout)/.test(value)) return fallback;
  return value;
}
