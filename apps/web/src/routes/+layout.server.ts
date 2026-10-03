import { CAPTCHA_SCRIPTS, themeHtmlAttrs, type ActiveTheme, type CaptchaConfig, type CspSources, type ExtensionClientBundle, type NavEntry, type Viewer } from '@forum/shared';
import { request } from '$lib/api';
import type { LayoutServerLoad } from './$types';

type Mode = 'system' | 'light' | 'dark';

export const load: LayoutServerLoad = async ({ fetch, locals, depends, url }) => {
  depends('app:viewer');
  const admin = url.pathname.startsWith('/admin');
  const [viewer, nav, ext] = await Promise.all([
    request<Viewer>(fetch, '/api/auth/me'),
    request<NavEntry[]>(fetch, '/api/nav').catch(() => [] as NavEntry[]),
    admin || locals.safeMode ? Promise.resolve(null) : request<ExtensionClientBundle>(fetch, '/api/extensions/client').catch(() => null),
  ]);
  const active = viewer.settings['appearance.theme'] as ActiveTheme | null | undefined;
  const locked = !!active && !active.options.mode.toggle;
  const pref: Mode = locked ? 'system' : viewer.user ? viewer.user.theme : locals.theme;
  const forumDefault = (viewer.settings['appearance.defaultMode'] ?? 'dark') as Mode;
  if (active && !url.pathname.startsWith('/admin')) {
    locals.attrs = Object.entries(themeHtmlAttrs(active))
      .map(([k, v]) => (v ? `${k}="${v.replace(/[^a-z0-9-]/gi, '')}"` : k))
      .join(' ');
  }
  locals.theme = pref === 'system' ? forumDefault : pref;
  locals.style = (viewer.settings['appearance.themeStyle'] ?? 'modern') as App.Locals['style'];
  locals.radius = String(viewer.settings['appearance.radius'] ?? 'auto');
  locals.lang = viewer.locale;
  const favicon = viewer.settings['appearance.faviconUrl'];
  if (typeof favicon === 'string' && favicon) locals.favicon = favicon;
  const csp: CspSources = ext?.csp ?? { script: [], connect: [], style: [], font: [] };
  const captcha = viewer.settings['captcha.config'] as CaptchaConfig | undefined;
  const cap = captcha && captcha.provider in CAPTCHA_SCRIPTS ? CAPTCHA_SCRIPTS[captcha.provider as keyof typeof CAPTCHA_SCRIPTS].csp : null;
  if (cap) for (const k of ['script', 'connect', 'style'] as const) csp[k] = [...csp[k], ...cap[k]];
  locals.extraCsp = Object.values(csp).some((l) => l?.length) ? csp : null;
  return { viewer, nav, theme: pref, themeDefault: forumDefault, ext, safeMode: locals.safeMode };
};
