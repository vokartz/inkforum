import { FALLBACK_LOCALE, LOCALE_INFO, SOURCE_LOCALE, isLocale, translate, withFallback, type Catalog, type Locale, type TParams } from '@forum/shared';

/**
 * Arayüz çevirisi. Kullanım: `t('Kaydet')`, `t('{n} konu', { n })`.
 * Anahtar Türkçe kaynak metnin kendisidir; katalogda yoksa Türkçe gösterilir.
 *
 * Dil kök düzende (+layout.svelte) sunucunun belirlediği değere ayarlanır. SSR bileşen çizimi eşzamanlı
 * olduğu için modül düzeyindeki dil değeri istekler arasında karışmaz. Modül düzeyinde (bileşen dışında,
 * bir kez çalışan) kodda t() çağırmayın; metni sabit bırakıp gösterildiği yerde t(metin) kullanın.
 */

// Yalnızca seçilen dilin kataloğu indirilir (her dil ayrı parça)
const loaders = import.meta.glob<{ default: Catalog }>('../../../../packages/shared/i18n/*.json');
const catalogs = new Map<Locale, Catalog>();
// Kurulum dilinde oluşturulmuş varsayılan içerik (ör. İngilizce kurulan forumdaki "Announcements"):
// çeviri → Türkçe kaynak anahtar eşlemesiyle ziyaretçinin diline çevrilir (tc)
const reverse = new Map<Locale, Map<string, string>>();
let contentLocale: Locale = SOURCE_LOCALE;

class I18nState {
  locale = $state<Locale>(SOURCE_LOCALE);
}
export const i18n = new I18nState();

async function fetchCatalog(locale: Locale): Promise<Catalog | undefined> {
  const key = Object.keys(loaders).find((k) => k.endsWith(`/${locale}.json`));
  if (!key) return undefined;
  try {
    return (await loaders[key]!()).default;
  } catch {
    return undefined; /* katalog yüklenemezse Türkçe gösterilir */
  }
}

/** `content`: forumun varsayılan dili (örnek içerik bu dilde oluşturulur) */
export async function loadCatalog(locale: Locale, content?: unknown): Promise<void> {
  if (isLocale(content) && content !== SOURCE_LOCALE) {
    contentLocale = content;
    if (!reverse.has(content)) {
      const raw = await fetchCatalog(content);
      const map = new Map<string, string>();
      for (const [k, v] of Object.entries(raw ?? {})) if (v && v !== k && !map.has(v)) map.set(v, k);
      reverse.set(content, map);
    }
  } else if (isLocale(content)) contentLocale = SOURCE_LOCALE;
  if (locale === SOURCE_LOCALE || catalogs.has(locale)) return;
  if (locale === FALLBACK_LOCALE) {
    const c = await fetchCatalog(locale);
    if (c) catalogs.set(locale, c);
    return;
  }
  // Çevrilmemiş metinler Türkçe yerine İngilizce görünür
  const [c, fallback] = await Promise.all([fetchCatalog(locale), fetchCatalog(FALLBACK_LOCALE)]);
  if (c || fallback) catalogs.set(locale, withFallback(c, fallback));
}

export function setLocale(locale: string | null | undefined): void {
  const l = isLocale(locale) ? locale : SOURCE_LOCALE;
  if (i18n.locale !== l) i18n.locale = l;
}

/** Çeviri */
export function t(source: string, params?: TParams): string {
  const l = i18n.locale;
  return translate(catalogs.get(l), l, source, params);
}

/**
 * Veritabanından gelen içerik (grup, başarı adı…): kurulumdaki varsayılan Türkçe metinse çevrilir,
 * yöneticinin yazdığı metin olduğu gibi kalır. Yer tutucu işlenmez.
 */
export function tc(text: string | null | undefined): string {
  if (!text) return text ?? '';
  const l = i18n.locale;
  // Forumun kurulum dilindeki varsayılan metin → Türkçe kaynak anahtar
  const source = contentLocale !== SOURCE_LOCALE ? reverse.get(contentLocale)?.get(text) : undefined;
  if (l === SOURCE_LOCALE) return source ?? text;
  return catalogs.get(l)?.[source ?? text] || text;
}

/** Intl için dil etiketi (ör. "en-US") */
export function localeTag(): string {
  return LOCALE_INFO[i18n.locale].tag;
}
