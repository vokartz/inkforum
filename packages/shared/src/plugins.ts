/**
 * Yerleşik eklentiler. Yönetim → Eklentiler ekranından açılıp kapatılır; kapalı bir eklentinin
 * API uç noktaları 404 döner, menü öğeleri ve yönetim sayfaları gizlenir. Veriler silinmez.
 */

export const PLUGIN_KEYS = ['landing', 'wiki', 'applications', 'tickets'] as const;
export type PluginKey = (typeof PLUGIN_KEYS)[number];

export interface PluginDef {
  key: PluginKey;
  name: string;
  description: string;
  /** Phosphor ikon adı */
  icon: string;
  version: string;
  author: string;
  category: 'site' | 'community' | 'support';
  features: string[];
  /** Yönetim sayfası */
  adminHref: string | null;
  /** Ziyaretçi sayfası */
  publicHref: string | null;
}

export const PLUGIN_CATEGORIES: Record<PluginDef['category'], string> = {
  site: 'Site ve içerik',
  community: 'Topluluk',
  support: 'Destek',
};

export const PLUGINS: PluginDef[] = [
  {
    key: 'landing',
    name: 'Açılış sayfası',
    description: 'Sürükle-bırak sayfalardan birini ana sayfa yapar; forum otomatik olarak /forum adresine taşınır.',
    icon: 'house-line',
    version: '1.0.0',
    author: 'InkForum',
    category: 'site',
    features: ['Ayrı site gibi tanıtım sayfası', 'Menü çubuğu, kapak, sunucu kartı, galeri blokları', 'Forum adresi otomatik /forum'],
    adminHref: '/admin/pages',
    publicHref: null,
  },
  {
    key: 'wiki',
    name: 'Wiki',
    description: 'İç içe sayfalardan oluşan bilgi bankası: rehberler, kurallar, sık sorulan sorular.',
    icon: 'book-open-text',
    version: '1.0.0',
    author: 'InkForum',
    category: 'site',
    features: ['Sınırsız alt sayfa ve ağaç menü', 'Otomatik içindekiler, arama', 'Sayfa geçmişi ve geri alma'],
    adminHref: '/admin/wiki',
    publicHref: '/wiki',
  },
  {
    key: 'applications',
    name: 'Başvurular',
    description: 'Ekip, rol ve oluşum başvuruları: özel sorular, gereksinimler, inceleme ve otomatik grup ataması.',
    icon: 'clipboard-text',
    version: '1.0.0',
    author: 'InkForum',
    category: 'community',
    features: ['8 soru türü ve gereksinimler', 'İnceleyici grupları, iç notlar', 'Onayda gruba otomatik ekleme'],
    adminHref: '/admin/applications',
    publicHref: '/applications',
  },
  {
    key: 'tickets',
    name: 'Destek talepleri',
    description: 'Üyelerin destek talebi açtığı yardım masası: kategoriler, sorumlu yetkili grupları, durumlar ve öncelikler.',
    icon: 'lifebuoy',
    version: '1.0.0',
    author: 'InkForum',
    category: 'support',
    features: ['Kategoriye göre sorumlu yetkili grubu', 'Durum, öncelik, yetkiliye atama', 'İç notlar ve bildirimler'],
    adminHref: '/admin/tickets',
    publicHref: '/tickets',
  },
];

export const PLUGIN_MAP = new Map(PLUGINS.map((p) => [p.key, p]));

/** Ayar kaydından eklentinin açık olup olmadığı (kayıt yoksa açık) */
export function pluginEnabled(settings: Record<string, unknown> | undefined | null, key: PluginKey): boolean {
  const map = (settings?.['plugins.enabled'] ?? {}) as Partial<Record<PluginKey, boolean>>;
  return map[key] !== false;
}

/** Açılış sayfası eklentisi kapalıysa ana sayfa her zaman forum dizinidir */
export function effectiveLanding(settings: Record<string, unknown> | undefined | null): string {
  return pluginEnabled(settings, 'landing') ? String(settings?.['home.landingPage'] ?? '') : '';
}

export interface AdminPlugin extends PluginDef {
  enabled: boolean;
  /** Kısa özet (ör. "7 sayfa", "3 bekleyen talep") */
  stats: string[];
}
