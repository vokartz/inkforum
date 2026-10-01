import { themeHtmlAttrs, type ActiveTheme, type NavEntry, type Viewer, type ViewerCustom } from '@forum/shared';
import { request } from '$lib/api';
import type { LayoutServerLoad } from './$types';

type Mode = 'system' | 'light' | 'dark';

export const load: LayoutServerLoad = async ({ fetch, locals, depends, url }) => {
  depends('app:viewer');
  const [viewer, nav, custom] = await Promise.all([
    request<Viewer>(fetch, '/api/auth/me'),
    request<NavEntry[]>(fetch, '/api/nav').catch(() => [] as NavEntry[]),
    // Güvenli modda özel kod hiç istenmez.
    locals.safeMode ? Promise.resolve(null) : request<ViewerCustom>(fetch, '/api/custom').catch(() => null),
  ]);
  // Tercih: üyenin profilindeki ya da misafirin çerezindeki değer; "system" = forum varsayılanı.
  // Etkin tema mod değiştirmeye izin vermiyorsa herkes temanın modunu görür
  const active = viewer.settings['appearance.theme'] as ActiveTheme | null | undefined;
  const locked = !!active && !active.options.mode.toggle;
  const pref: Mode = locked ? 'system' : viewer.user ? viewer.user.theme : locals.theme;
  const forumDefault = (viewer.settings['appearance.defaultMode'] ?? 'dark') as Mode;
  // Tema yönetim panelinde uygulanmaz (panel her zaman okunaklı kalsın)
  if (active && !url.pathname.startsWith('/admin')) {
    locals.attrs = Object.entries(themeHtmlAttrs(active))
      .map(([k, v]) => (v ? `${k}="${v.replace(/[^a-z0-9-]/gi, '')}"` : k))
      .join(' ');
  }
  locals.theme = pref === 'system' ? forumDefault : pref;
  locals.style = (viewer.settings['appearance.themeStyle'] ?? 'modern') as App.Locals['style'];
  locals.radius = String(viewer.settings['appearance.radius'] ?? 'auto');
  locals.lang = viewer.locale;
  // Site simgesi sunucuda yazılır (tarayıcı ilk simgeyi alır; sonradan eklenen <link> çoğu zaman yok sayılır)
  const favicon = viewer.settings['appearance.faviconUrl'];
  if (typeof favicon === 'string' && favicon) locals.favicon = favicon;
  locals.customCsp = custom?.enabled ? custom.csp : null;
  return { viewer, nav, theme: pref, themeDefault: forumDefault, custom: custom?.enabled ? custom : null, safeMode: locals.safeMode };
};
