import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LANG_COOKIE,
  LOCALES,
  SOURCE_LOCALE,
  createMessageTranslator,
  isLocale,
  matchAcceptLanguage,
  translate,
  type Catalog,
  type Locale,
  type TParams,
  SETTINGS,
  type SettingKey,
} from '@forum/shared';
import { CONFIG, type AppConfig } from '../config/config.js';
import { SettingsService } from '../settings/settings.service.js';

/** Çerez başlığından tek bir değeri okur */
function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/**
 * Sunucu tarafı çeviri: API hata mesajları, e-postalar, doğrulama sayfası, kurulum denetimleri.
 * Kataloglar `packages/shared/i18n/*.json` (kaynak kod) ya da sürüm paketinde `i18n/*.json`.
 */
@Injectable()
export class I18nService {
  private readonly logger = new Logger('i18n');
  private readonly catalogs = new Map<Locale, Catalog>();
  private readonly messageTranslators = new Map<Locale, (text: string) => string>();

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly settings: SettingsService,
  ) {
    const dir = [join(config.root, 'i18n'), join(config.root, 'packages/shared/i18n')].find((d) => existsSync(d));
    for (const l of LOCALES) {
      if (l === SOURCE_LOCALE) continue;
      try {
        if (dir) this.catalogs.set(l, JSON.parse(readFileSync(join(dir, `${l}.json`), 'utf8')) as Catalog);
      } catch {
        this.logger.warn(`${l} dil dosyası okunamadı; Türkçe gösterilecek.`);
      }
    }
  }

  catalog(locale: Locale): Catalog | undefined {
    return this.catalogs.get(locale);
  }

  enabled(): Locale[] {
    const list = this.settings.get('i18n.enabledLocales') as Locale[];
    return list.length ? list : [...LOCALES];
  }

  /** Forum varsayılanı; kurulumdan önce (ayar kaydedilmemişken) DEFAULT_LOCALE ortam değişkeni */
  defaultLocale(): Locale {
    if (this.config.defaultLocale && !this.settings.isStored('i18n.defaultLocale')) return this.config.defaultLocale;
    const d = this.settings.get('i18n.defaultLocale') as Locale;
    return isLocale(d) ? d : SOURCE_LOCALE;
  }

  /** Üye tercihi → dil çerezi → tarayıcı dili → forum varsayılanı */
  resolve(opts: { preference?: string | null; cookie?: string | null; acceptLanguage?: string | null }): Locale {
    const enabled = this.enabled();
    if (isLocale(opts.preference) && enabled.includes(opts.preference)) return opts.preference;
    const fromCookie = cookieValue(opts.cookie ?? undefined, LANG_COOKIE);
    if (isLocale(fromCookie) && enabled.includes(fromCookie)) return fromCookie;
    if (this.settings.get('i18n.detectBrowser')) {
      const accepted = matchAcceptLanguage(opts.acceptLanguage, enabled);
      if (accepted) return accepted;
    }
    return this.defaultLocale();
  }

  t(locale: Locale, source: string, params?: TParams): string {
    return translate(this.catalogs.get(locale), locale, source, params);
  }

  /**
   * Yönetimde değiştirilmemiş (varsayılan Türkçe) metin ayarlarını ziyaretçinin diline çevirir:
   * bakım mesajı, çerez bildirimi, karşılama metni vb. Yönetici değiştirdiyse olduğu gibi kalır.
   */
  localizeSettings<T extends Record<string, unknown>>(values: T, locale: Locale): T {
    if (locale === SOURCE_LOCALE) return values;
    const out: Record<string, unknown> = { ...values };
    for (const [key, value] of Object.entries(values)) {
      const def = SETTINGS[key as SettingKey];
      if (def && typeof value === 'string' && value && value === def.default) out[key] = this.t(locale, value);
    }
    return out as T;
  }

  /** HTML içindeki metin parçalarını (etiketler arası) tek tek çevirir; etiketler ve {{değişkenler}} korunur */
  html(locale: Locale, html: string): string {
    if (locale === SOURCE_LOCALE) return html;
    return html.replace(/(^|>)([^<]+)(?=<|$)/g, (_m, pre: string, text: string) => {
      const core = text.trim();
      if (!core || !/\p{L}/u.test(core)) return pre + text;
      const lead = text.slice(0, text.indexOf(core));
      const trail = text.slice(text.indexOf(core) + core.length);
      return pre + lead + this.t(locale, core) + trail;
    });
  }

  /** Önceden doldurulmuş Türkçe bir metni (hata mesajı vb.) hedef dile çevirir */
  message(locale: Locale, text: string): string {
    if (locale === SOURCE_LOCALE || !text) return text;
    let fn = this.messageTranslators.get(locale);
    if (!fn) {
      fn = createMessageTranslator(this.catalogs.get(locale) ?? {}, locale);
      this.messageTranslators.set(locale, fn);
    }
    return fn(text);
  }
}
