import type { Reroute } from '@sveltejs/kit';
import type { ExtensionRouteOverride } from '@forum/shared';

const TTL = 30_000;
const SKIP = /^\/(admin|api|install|ext-assets|uploads|emoji|_app|x-ext|login|logout|register|oauth|settings|reset-password|forgot-password|change-password|confirm-email|verify-email|banned)(\/|$)/;
let cache: { at: number; list: ExtensionRouteOverride[] } | null = null;
let pending: Promise<ExtensionRouteOverride[]> | null = null;

async function overrides(fetch: typeof globalThis.fetch): Promise<ExtensionRouteOverride[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.list;
  pending ??= fetch('/api/extensions/routes', { headers: { accept: 'application/json' } })
    .then(async (r) => (r.ok ? ((await r.json()) as ExtensionRouteOverride[]) : []))
    .catch(() => [] as ExtensionRouteOverride[])
    .then((list) => {
      cache = { at: Date.now(), list };
      pending = null;
      return list;
    });
  return pending;
}

export const reroute: Reroute = async ({ url, fetch }) => {
  if (SKIP.test(url.pathname) || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return;
  const list = await overrides(fetch);
  if (!list.length) return;
  const path = url.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  const hit = list.some((o) => path === o.base || (o.wildcard && (o.base === '' ? path !== '' : path.startsWith(`${o.base}/`))));
  if (hit) return path ? `/x-ext/${path}` : '/x-ext';
};
