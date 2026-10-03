import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch, setHeaders }) => {
  const res = await fetch('/api/seo/brand');
  const icon = res.ok ? ((await res.json()) as { icon: string | null }).icon : null;
  setHeaders({ 'cache-control': 'public, max-age=3600' });
  redirect(302, icon && icon.startsWith('/') ? icon : '/brand/inkforum-icon-192.png');
};
