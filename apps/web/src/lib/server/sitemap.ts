export interface SitemapUrl {
  loc: string;
  lastmod: number | null;
  priority?: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const iso = (ms: number) => new Date(ms).toISOString();

export function urlset(urls: SitemapUrl[]): string {
  const body = urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${iso(u.lastmod)}</lastmod>` : ''}${u.priority !== undefined ? `<priority>${u.priority.toFixed(1)}</priority>` : ''}</url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function sitemapIndex(locs: string[]): string {
  const body = locs.map((l) => `  <sitemap><loc>${esc(l)}</loc></sitemap>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export const xmlHeaders = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=900' };
