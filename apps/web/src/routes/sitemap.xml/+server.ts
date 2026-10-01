import { sitemapIndex, xmlHeaders } from '$lib/server/sitemap';
import type { RequestHandler } from './$types';

/** Site haritası dizini: sayfalar + konu parçaları (her biri en fazla 10.000 adres) */
export const GET: RequestHandler = async ({ fetch, url }) => {
  const res = await fetch('/api/seo/sitemap');
  const { topicPages } = res.ok ? ((await res.json()) as { topicPages: number }) : { topicPages: 0 };
  const locs = [`${url.origin}/sitemap-pages.xml`];
  for (let i = 1; i <= topicPages; i++) locs.push(`${url.origin}/sitemap-topics-${i}.xml`);
  return new Response(sitemapIndex(locs), { headers: xmlHeaders });
};
