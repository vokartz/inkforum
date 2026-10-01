import { error } from '@sveltejs/kit';
import { urlset, xmlHeaders, type SitemapUrl } from '$lib/server/sitemap';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch, params }) => {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1 || n > 10_000) error(404, 'Bulunamadı');
  const res = await fetch(`/api/seo/sitemap/topics/${n}`);
  const urls = res.ok ? ((await res.json()) as SitemapUrl[]) : [];
  if (!urls.length) error(404, 'Bulunamadı');
  return new Response(urlset(urls), { headers: xmlHeaders });
};
