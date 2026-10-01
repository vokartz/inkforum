import type { RequestHandler } from './$types';

interface Brand {
  name: string;
  description: string;
  icon: string | null;
  accent: string;
  mode: string;
  lang?: string;
}

/** Ana ekrana ekleme (PWA) bildirimi: forum adı, simge ve renkler yönetimden gelir */
export const GET: RequestHandler = async ({ fetch }) => {
  const res = await fetch('/api/seo/brand');
  const b: Brand = res.ok ? await res.json() : { name: 'InkForum', description: '', icon: null, accent: '#7b61ff', mode: 'dark' };
  const icons = b.icon
    ? [{ src: b.icon, sizes: 'any', purpose: 'any' }]
    : [
        { src: '/brand/inkforum-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/brand/inkforum-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ];
  const manifest = {
    name: b.name,
    short_name: b.name.length > 14 ? b.name.slice(0, 14).trim() : b.name,
    description: b.description,
    lang: b.lang ?? 'tr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: b.mode === 'light' ? '#f6f7fb' : '#0f1219',
    theme_color: b.accent,
    icons,
  };
  return new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
