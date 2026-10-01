import { urlset, xmlHeaders, type SitemapUrl } from '$lib/server/sitemap';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) => {
  const res = await fetch('/api/seo/sitemap/pages');
  const urls = res.ok ? ((await res.json()) as SitemapUrl[]) : [];
  return new Response(urlset(urls), { headers: xmlHeaders });
};
