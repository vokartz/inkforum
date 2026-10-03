import type { Handle, HandleFetch } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const THEMES = new Set(['system', 'light', 'dark']);

export const handle: Handle = async ({ event, resolve }) => {
  const cookieTheme = event.cookies.get('forum_theme');
  event.locals.theme = cookieTheme && THEMES.has(cookieTheme) ? (cookieTheme as App.Locals['theme']) : 'system';
  event.locals.style = 'modern';
  event.locals.radius = 'auto';
  event.locals.lang = 'tr';
  event.locals.favicon = '/brand/inkforum-icon-192.png';
  event.locals.extraCsp = null;
  event.locals.attrs = '';

  const safeParam = event.url.searchParams.get('safemode');
  if (safeParam === '1') event.cookies.set('forum_safemode', '1', { path: '/', httpOnly: true, sameSite: 'lax' });
  else if (safeParam === '0') event.cookies.delete('forum_safemode', { path: '/' });
  event.locals.safeMode = safeParam === '1' || (safeParam !== '0' && event.cookies.get('forum_safemode') === '1');

  const install = await installGate(event);
  if (install) return install;

  const blocked = await wafGate(event);
  if (blocked) return blocked;

  const legacy = await legacyGate(event);
  if (legacy) return legacy;

  const response = await resolve(event, {
    transformPageChunk: ({ html }) =>
      html
        .replace('%forum.theme%', event.locals.theme)
        .replace('%forum.style%', event.locals.style)
        .replace('%forum.radius%', event.locals.radius)
        .replace('%forum.attrs%', event.locals.attrs)
        .replace('%forum.lang%', event.locals.lang)
        .replace('%forum.favicon%', escapeAttr(event.locals.favicon)),
  });
  const sameOriginFrame = event.request.headers.get('sec-fetch-dest') === 'iframe' && event.request.headers.get('sec-fetch-site') === 'same-origin';
  if (event.url.pathname === '/studio/frame' || (sameOriginFrame && !event.url.pathname.startsWith('/admin'))) {
    const csp = response.headers.get('content-security-policy');
    if (csp) response.headers.set('content-security-policy', csp.replace("frame-ancestors 'none'", "frame-ancestors 'self'"));
  }
  if (event.url.pathname.startsWith('/embed/')) {
    const csp = response.headers.get('content-security-policy');
    if (csp) response.headers.set('content-security-policy', csp.replace("frame-ancestors 'none'", 'frame-ancestors *'));
  }
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  const extra = event.locals.extraCsp;
  if (extra && !event.url.pathname.startsWith('/admin')) extendCsp(response, extra);
  return response;
};

const isAssetPath = (path: string) =>
  path === '/api' || path.startsWith('/api/') || path.startsWith('/_app/') || path.startsWith('/@') || path.startsWith('/node_modules/') || /\.[a-z0-9]{1,11}$/i.test(path);

let installed = false;

async function installGate(event: Parameters<Handle>[0]['event']): Promise<Response | null> {
  const path = event.url.pathname;
  const onInstall = path === '/install' || path.startsWith('/install/');
  if (installed) return onInstall ? new Response(null, { status: 303, headers: { location: '/' } }) : null;
  if (isAssetPath(path)) return null;
  try {
    const r = await event.fetch('/api/install/status');
    if (!r.ok) return null;
    installed = ((await r.json()) as { installed: boolean }).installed;
  } catch {
    return null;
  }
  if (installed) return onInstall ? new Response(null, { status: 303, headers: { location: '/' } }) : null;
  return onInstall ? null : new Response(null, { status: 303, headers: { location: '/install' } });
}

async function wafGate(event: Parameters<Handle>[0]['event']): Promise<Response | null> {
  if (globalThis.__FORUM_API_INJECT__ || event.request.method !== 'GET') return null;
  const path = event.url.pathname;
  if (path === '/api' || path.startsWith('/api/') || path.startsWith('/_app/') || path.startsWith('/@') || path.startsWith('/node_modules/') || /\.[a-z0-9]{1,6}$/i.test(path)) return null;
  try {
    const r = await event.fetch(`/api/waf/gate?path=${encodeURIComponent(path + event.url.search)}`);
    if (!r.ok) return null;
    const d = (await r.json()) as { action: string; status?: number; html?: string; csp?: string };
    if (d.action === 'allow' || !d.html) return null;
    return new Response(d.html, { status: d.status ?? 403, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': d.csp ?? "default-src 'none'", 'cache-control': 'no-store' } });
  } catch {
    return null;
  }
}

type LegacyKind = 'topic' | 'post' | 'board' | 'user';

function legacyTarget(url: URL): { kind: LegacyKind; id: string } | null {
  const path = url.pathname.toLowerCase();
  const full = decodeURIComponent(url.pathname + url.search);
  const q = (name: string) => new RegExp(`[?&;]${name}=(\\d+)`, 'i').exec(full)?.[1] ?? null;
  const hit = (kind: LegacyKind, id: string | null) => (id ? { kind, id } : null);
  if (path.endsWith('/viewtopic.php')) return hit('post', q('p')) ?? hit('topic', q('t'));
  if (path.endsWith('/viewforum.php')) return hit('board', q('f'));
  if (path.endsWith('/memberlist.php')) return hit('user', q('u'));
  if (path.endsWith('/showthread.php')) return hit('post', q('pid')) ?? hit('topic', q('tid'));
  if (path.endsWith('/forumdisplay.php')) return hit('board', q('fid'));
  if (path.endsWith('/member.php')) return hit('user', q('uid'));
  let m = /\/thread-(\d+)(?:-post-(\d+))?/.exec(path);
  if (m && path.endsWith('.html')) return m[2] ? { kind: 'post', id: m[2] } : { kind: 'topic', id: m[1]! };
  m = /\/(forum|user)-(\d+)\.html$/.exec(path);
  if (m) return { kind: m[1] === 'forum' ? 'board' : 'user', id: m[2]! };
  if (path.endsWith('/index.php') && !url.search.startsWith('?/')) {
    const msg = /[?&;]topic=\d+\.msg(\d+)/i.exec(full)?.[1] ?? /[?&;]msg=(\d+)/i.exec(full)?.[1];
    if (msg) return { kind: 'post', id: msg };
    return hit('topic', /[?&;]topic=(\d+)/i.exec(full)?.[1] ?? null) ?? hit('board', /[?&;]board=(\d+)/i.exec(full)?.[1] ?? null) ?? (/action=profile/i.test(full) ? hit('user', q('u')) : null);
  }
  m = /(?:^|\/|\?)(threads|posts|forums|members)\/(?:[^/?#]*\.)?(\d+)\/?(?:(?:page-\d+\/?)?#?post-(\d+))?/.exec(full.toLowerCase());
  if (m) {
    if (m[3]) return { kind: 'post', id: m[3] };
    return { kind: m[1] === 'threads' ? 'topic' : m[1] === 'posts' ? 'post' : m[1] === 'forums' ? 'board' : 'user', id: m[2]! };
  }
  if (/\/goto\/post$/.test(path) || /[?&]goto\/post/.test(full)) return hit('post', q('id'));
  m = /\/(topic|forum|profile)\/(\d+)-/.exec(full.toLowerCase());
  if (m) return { kind: m[1] === 'topic' ? 'topic' : m[1] === 'forum' ? 'board' : 'user', id: m[2]! };
  return null;
}

async function legacyGate(event: Parameters<Handle>[0]['event']): Promise<Response | null> {
  if (event.request.method !== 'GET') return null;
  let target: ReturnType<typeof legacyTarget>;
  try {
    target = legacyTarget(event.url);
  } catch {
    return null;
  }
  if (!target) return null;
  try {
    const r = await event.fetch(`/api/import/legacy?kind=${target.kind}&id=${target.id}`);
    if (!r.ok) return null;
    const { url } = (await r.json()) as { url: string };
    return url.startsWith('/') ? new Response(null, { status: 301, headers: { location: url } }) : null;
  } catch {
    return null;
  }
}

const escapeAttr = (s: string) => s.replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]!);

const CSP_SOURCE = /^(https|wss):\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{2,5})?$/i;
const CSP_TARGETS = { script: 'script-src', connect: 'connect-src', style: 'style-src', font: 'font-src', frame: 'frame-src', img: 'img-src' } as const;

function extendCsp(response: Response, extra: NonNullable<App.Locals['extraCsp']>): void {
  const header = response.headers.get('content-security-policy');
  if (!header) return;
  let policy = header;
  for (const [key, directive] of Object.entries(CSP_TARGETS) as Array<[keyof typeof CSP_TARGETS, string]>) {
    const sources = (extra[key] ?? []).filter((s) => CSP_SOURCE.test(s));
    if (!sources.length) continue;
    const re = new RegExp(`(^|;\\s*)${directive}\\s([^;]*)`);
    policy = re.test(policy) ? policy.replace(re, (_m, pre: string, list: string) => `${pre}${directive} ${list} ${sources.join(' ')}`) : `${policy}; ${directive} ${sources.join(' ')}`;
  }
  try {
    response.headers.set('content-security-policy', policy);
  } catch {
  }
}

export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  const url = new URL(request.url);
  if (url.origin !== event.url.origin || !(url.pathname === '/api' || url.pathname.startsWith('/api/'))) {
    return fetch(request);
  }

  const headers = new Headers(request.headers);
  const cookie = event.request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const ua = event.request.headers.get('user-agent');
  if (ua) headers.set('user-agent', ua);
  const lang = event.request.headers.get('accept-language');
  if (lang) headers.set('accept-language', lang);
  let ip = '127.0.0.1';
  try {
    ip = event.getClientAddress();
  } catch {
  }
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : Buffer.from(await request.arrayBuffer());

  const inject = globalThis.__FORUM_API_INJECT__;
  if (inject) {
    headers.set('host', event.url.host);
    const res = await inject({
      method: request.method as 'GET',
      url: url.pathname + url.search,
      headers: Object.fromEntries(headers),
      payload: body,
      remoteAddress: ip,
    });
    const out = new Headers();
    for (const [k, v] of Object.entries(res.headers)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) for (const item of v) out.append(k, String(item));
      else out.set(k, String(v));
    }
    const noBody = res.statusCode === 204 || res.statusCode === 304;
    return new Response(noBody ? null : new Uint8Array(res.rawPayload), { status: res.statusCode, headers: out });
  }

  const target = (env.INTERNAL_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
  headers.set('x-forwarded-for', ip);
  headers.set('x-forwarded-host', event.url.host);
  headers.set('x-forwarded-proto', event.url.protocol.replace(':', ''));
  return fetch(new Request(target + url.pathname + url.search, { method: request.method, headers, body }));
};
