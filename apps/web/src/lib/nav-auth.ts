import { page } from '$app/state';

/** Giriş sayfası adresi; girişten sonra bulunulan sayfaya dönülür. */
export function loginHref(): string {
  const here = page.url.pathname + page.url.search;
  return here === '/' || here.startsWith('/login') || here.startsWith('/register') ? '/login' : `/login?next=${encodeURIComponent(here)}`;
}
