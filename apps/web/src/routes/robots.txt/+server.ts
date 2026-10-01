import type { RequestHandler } from './$types';

/** Dinamik robots.txt (Yönetim → Ayarlar → Arama motorları ve paylaşım) */
export const GET: RequestHandler = async ({ fetch }) => {
  const res = await fetch('/api/seo/robots');
  const body = res.ok ? await res.text() : 'User-agent: *\nAllow: /\n';
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=900' } });
};
