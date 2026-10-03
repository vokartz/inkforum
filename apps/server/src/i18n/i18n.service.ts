import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LANG_COOKIE,
  LOCALES,
  FALLBACK_LOCALE,
  SOURCE_LOCALE,
  createMessageTranslator,
  isLocale,
  matchAcceptLanguage,
  translate,
  withFallback,
  type Catalog,
  type Locale,
  type TParams,
  SETTINGS,
  type SettingKey,
} from '@forum/shared';
import { CONFIG, type AppConfig } from '../config/config.js';
import { SettingsService } from '../settings/settings.service.js';

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

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
    const read = (l: Locale): Catalog | undefined => {
      try {
        if (dir) return JSON.parse(readFileSync(join(dir, `${l}.json`), 'utf8')) as Catalog;
      } catch {
        this.logger.warn(`${l} dil dosyası okunamadı; Türkçe gösterilecek.`);
      }
      return undefined;
    };
    const fallback = read(FALLBACK_LOCALE);
    for (const l of LOCALES) {
      if (l === SOURCE_LOCALE) continue;
      const catalog = l === FALLBACK_LOCALE ? fallback : read(l);
      if (catalog) this.catalogs.set(l, l === FALLBACK_LOCALE ? catalog : withFallback(catalog, fallback));
    }
  }

  catalog(locale: Locale): Catalog | undefined {
    return this.catalogs.get(locale);
  }

  enabled(): Locale[] {
    const list = this.settings.get('i18n.enabledLocales') as Locale[];
    return list.length ? list : [...LOCALES];
  }

  defaultLocale(): Locale {
    if (this.config.defaultLocale && !this.settings.isStored('i18n.defaultLocale')) return this.config.defaultLocale;
    const d = this.settings.get('i18n.defaultLocale') as Locale;
    return isLocale(d) ? d : SOURCE_LOCALE;
  }

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

  localizeSettings<T extends Record<string, unknown>>(values: T, locale: Locale): T {
    if (locale === SOURCE_LOCALE) return values;
    const out: Record<string, unknown> = { ...values };
    for (const [key, value] of Object.entries(values)) {
      const def = SETTINGS[key as SettingKey];
      if (def && typeof value === 'string' && value && value === def.default) out[key] = this.t(locale, value);
    }
    return out as T;
  }

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
