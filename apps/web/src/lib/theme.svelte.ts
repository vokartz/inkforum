import { browser } from '$app/environment';

/** Üyenin tercihi: `system` = "forum varsayılanını kullan". */
export type ThemePreference = 'system' | 'light' | 'dark';

/** Tema tercihi: <html data-theme> + çerez (misafirler için) + profil (üyeler için). */
class ThemeState {
  preference = $state<ThemePreference>('system');
  /** Yönetimin seçtiği varsayılan mod (`system` = cihaz ayarı). */
  forumDefault = $state<ThemePreference>('dark');
  private systemDark = $state(false);

  constructor() {
    if (browser) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      this.systemDark = mq.matches;
      mq.addEventListener('change', (e) => (this.systemDark = e.matches));
    }
  }

  /** <html data-theme> değeri */
  get attr(): ThemePreference {
    return this.preference === 'system' ? this.forumDefault : this.preference;
  }

  get resolved(): 'light' | 'dark' {
    const a = this.attr;
    return a === 'system' ? (this.systemDark ? 'dark' : 'light') : a;
  }

  init(pref: ThemePreference, forumDefault: ThemePreference): void {
    this.preference = pref;
    this.forumDefault = forumDefault;
    if (browser) document.documentElement.dataset.theme = this.attr;
  }

  set(pref: ThemePreference): void {
    this.preference = pref;
    if (!browser) return;
    document.documentElement.dataset.theme = this.attr;
    document.cookie = `forum_theme=${pref}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }
}

export const theme = new ThemeState();

/** Renk (#RRGGBB) üzerinde okunaklı yazı rengi. */
export function readableOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#111111';
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.4 ? '#141414' : '#ffffff';
}
