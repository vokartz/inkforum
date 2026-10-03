import { page } from '$app/state';

export function loginHref(): string {
  const here = page.url.pathname + page.url.search;
  return here === '/' || here.startsWith('/login') || here.startsWith('/register') ? '/login' : `/login?next=${encodeURIComponent(here)}`;
}
