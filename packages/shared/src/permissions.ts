export const SYSTEM_GROUP_KEYS = ['guest', 'member', 'admin', 'global_moderator', 'moderator'] as const;
export type SystemGroupKey = (typeof SYSTEM_GROUP_KEYS)[number];

export type PermissionScope = 'global' | 'board';

export interface PermissionCategory {
  key: string;
  label: string;
  description?: string;
}

export interface PermissionDefinition {
  key: string;
  scope: PermissionScope;
  category: string;
  label: string;
  description?: string;
  defaults: Partial<Record<Exclude<SystemGroupKey, 'admin'>, 1 | -1>>;
  guestGrantable: boolean;
  dangerous?: boolean;
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  { key: 'general', label: 'Genel', description: 'Forumun genel alanlarına erişim' },
  { key: 'profile', label: 'Profil', description: 'Profil görüntüleme ve düzenleme' },
  { key: 'moderation', label: 'Moderasyon', description: 'Üyeler üzerinde moderasyon işlemleri' },
  { key: 'admin', label: 'Yönetim', description: 'Yönetim paneli bölümleri' },
  { key: 'board', label: 'Bölüm', description: 'Bölüm içinde okuma ve yazma (bölüm yetki profillerinde ayarlanır)' },
  { key: 'board_moderation', label: 'Bölüm moderasyonu', description: 'Bölüm içindeki konu ve mesajlar üzerinde moderasyon' },
];

const MODS = { global_moderator: 1 } as const;

export const PERMISSIONS: PermissionDefinition[] = [
  {
    key: 'members.list',
    scope: 'global',
    category: 'general',
    label: 'Üye listesini görüntüleme',
    defaults: { member: 1 },
    guestGrantable: true,
  },
  {
    key: 'messages.send',
    scope: 'global',
    category: 'general',
    label: 'Özel mesaj gönderme',
    description: 'Yeni konuşma başlatma ve konuşmalara yanıt yazma.',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'online.view',
    scope: 'global',
    category: 'general',
    label: 'Kimlerin çevrimiçi olduğunu görme',
    defaults: { guest: 1, member: 1 },
    guestGrantable: true,
  },
  {
    key: 'groups.view',
    scope: 'global',
    category: 'general',
    label: 'Grup listesini ve grup sayfalarını görüntüleme',
    defaults: { guest: 1, member: 1 },
    guestGrantable: true,
  },
  {
    key: 'groups.join',
    scope: 'global',
    category: 'general',
    label: 'Açık gruplara katılma ve katılım isteği gönderme',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'applications.apply',
    scope: 'global',
    category: 'general',
    label: 'Başvuru formlarını görme ve başvuru yapma',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'tickets.create',
    scope: 'global',
    category: 'general',
    label: 'Destek talebi açma',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'wiki.view',
    scope: 'global',
    category: 'general',
    label: 'Wiki sayfalarını görüntüleme',
    defaults: { guest: 1, member: 1 },
    guestGrantable: true,
  },
  {
    key: 'wiki.edit',
    scope: 'global',
    category: 'general',
    label: 'Wiki sayfalarını düzenleme ve yeni sayfa ekleme',
    description: 'Kilitli sayfalar yalnızca wiki yöneticileri tarafından düzenlenebilir.',
    defaults: { global_moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'achievements.view',
    scope: 'global',
    category: 'general',
    label: 'Başarı listesini görüntüleme',
    defaults: { guest: 1, member: 1 },
    guestGrantable: true,
  },
  {
    key: 'warnings.view.own',
    scope: 'global',
    category: 'general',
    label: 'Kendi uyarılarını ve uyarı puanını görme',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'notifications.receive',
    scope: 'global',
    category: 'general',
    label: 'Bildirim alma',
    defaults: { member: 1 },
    guestGrantable: false,
  },

  {
    key: 'profile.view',
    scope: 'global',
    category: 'profile',
    label: 'Üye profillerini görüntüleme',
    defaults: { guest: 1, member: 1 },
    guestGrantable: true,
  },
  {
    key: 'profile.edit.own',
    scope: 'global',
    category: 'profile',
    label: 'Kendi profilini düzenleme',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'profile.edit.any',
    scope: 'global',
    category: 'profile',
    label: 'Herhangi bir üyenin profilini düzenleme',
    defaults: {},
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'profile.avatar.upload',
    scope: 'global',
    category: 'profile',
    label: 'Avatar yükleme',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'profile.signature',
    scope: 'global',
    category: 'profile',
    label: 'İmza kullanma',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'profile.customTitle',
    scope: 'global',
    category: 'profile',
    label: 'Özel başlık belirleme',
    defaults: { ...MODS },
    guestGrantable: false,
  },
  {
    key: 'profile.username.change',
    scope: 'global',
    category: 'profile',
    label: 'Kendi kullanıcı adını değiştirme',
    defaults: {},
    guestGrantable: false,
  },
  {
    key: 'profile.displayName.change',
    scope: 'global',
    category: 'profile',
    label: 'Kendi görünen adını değiştirme',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'profile.delete.own',
    scope: 'global',
    category: 'profile',
    label: 'Kendi hesabını silme',
    defaults: {},
    guestGrantable: false,
  },

  {
    key: 'mod.warnings.view',
    scope: 'global',
    category: 'moderation',
    label: 'Üyelerin uyarı geçmişini görme',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'mod.warnings.issue',
    scope: 'global',
    category: 'moderation',
    label: 'Üyelere uyarı verme',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'mod.warnings.revoke',
    scope: 'global',
    category: 'moderation',
    label: 'Verilmiş uyarıları geri alma',
    defaults: { ...MODS },
    guestGrantable: false,
  },
  {
    key: 'mod.users.notes',
    scope: 'global',
    category: 'moderation',
    label: 'Üyeler hakkında moderatör notu tutma',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'mod.users.watch',
    scope: 'global',
    category: 'moderation',
    label: 'Üyeleri izleme listesine alma',
    defaults: { ...MODS },
    guestGrantable: false,
  },
  {
    key: 'mod.users.ban',
    scope: 'global',
    category: 'moderation',
    label: 'Üyeleri yasaklama',
    defaults: { ...MODS },
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'mod.ip.view',
    scope: 'global',
    category: 'moderation',
    label: 'IP adreslerini görme',
    defaults: { ...MODS },
    guestGrantable: false,
  },

  {
    key: 'admin.access',
    scope: 'global',
    category: 'admin',
    label: 'Yönetim paneline erişim',
    defaults: {},
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'admin.settings',
    scope: 'global',
    category: 'admin',
    label: 'Forum ayarlarını değiştirme',
    defaults: {},
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'admin.users.view',
    scope: 'global',
    category: 'admin',
    label: 'Üye yönetimini görüntüleme',
    defaults: {},
    guestGrantable: false,
  },
  {
    key: 'admin.users.edit',
    scope: 'global',
    category: 'admin',
    label: 'Üyeleri düzenleme (grup, durum, bilgiler)',
    defaults: {},
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'admin.users.approve',
    scope: 'global',
    category: 'admin',
    label: 'Onay bekleyen üyeleri onaylama/reddetme',
    defaults: {},
    guestGrantable: false,
  },
  {
    key: 'admin.users.delete',
    scope: 'global',
    category: 'admin',
    label: 'Üye hesaplarını silme',
    defaults: {},
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'admin.groups.manage',
    scope: 'global',
    category: 'admin',
    label: 'Grupları yönetme',
    defaults: {},
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'admin.permissions.manage',
    scope: 'global',
    category: 'admin',
    label: 'Yetkileri yönetme',
    defaults: {},
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'admin.policies.manage',
    scope: 'global',
    category: 'admin',
    label: 'Politikaları (kurallar, gizlilik) yönetme',
    defaults: {},
    guestGrantable: false,
  },
  {
    key: 'admin.profileFields.manage',
    scope: 'global',
    category: 'admin',
    label: 'Özel profil alanlarını yönetme',
    defaults: {},
    guestGrantable: false,
  },
  {
    key: 'admin.bans.manage',
    scope: 'global',
    category: 'admin',
    label: 'Yasakları yönetme',
    defaults: {},
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'admin.warnings.manage',
    scope: 'global',
    category: 'admin',
    label: 'Uyarı şablonlarını ve eşik eylemlerini yönetme',
    defaults: {},
    guestGrantable: false,
  },
  {
    key: 'admin.achievements.manage',
    scope: 'global',
    category: 'admin',
    label: 'Başarıları yönetme ve elle verme',
    defaults: {},
    guestGrantable: false,
  },
  {
    key: 'admin.logs.view',
    scope: 'global',
    category: 'admin',
    label: 'Yönetim ve güvenlik kayıtlarını görüntüleme',
    defaults: {},
    guestGrantable: false,
  },
  {
    key: 'admin.maintenance',
    scope: 'global',
    category: 'admin',
    label: 'Bakım işlemleri (önbellek, yeniden sayım, işler)',
    defaults: {},
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'admin.forum.manage',
    scope: 'global',
    category: 'admin',
    label: 'Forum yapısını yönetme (kategoriler, bölümler, önekler)',
    defaults: {},
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'admin.pages.manage',
    scope: 'global',
    category: 'admin',
    label: 'Özel sayfaları yönetme (BBCode içerik)',
    defaults: {},
    guestGrantable: false,
  },
  {
    key: 'admin.applications',
    scope: 'global',
    category: 'admin',
    label: 'Başvuru formlarını yönetme ve tüm başvuruları inceleme',
    defaults: {},
    guestGrantable: false,
  },
  {
    key: 'admin.tickets',
    scope: 'global',
    category: 'admin',
    label: 'Destek kategorilerini yönetme ve tüm talepleri görme',
    defaults: {},
    guestGrantable: false,
  },
  {
    key: 'admin.wiki',
    scope: 'global',
    category: 'admin',
    label: 'Wiki yönetimi (sayfa silme, taşıma, sıralama, kilitleme)',
    defaults: {},
    guestGrantable: false,
  },
  {
    key: 'admin.developers',
    scope: 'global',
    category: 'admin',
    label: 'Geliştirici platformu (OAuth uygulamaları, API anahtarları, webhook\'lar, sosyal giriş)',
    defaults: {},
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'admin.extensions',
    scope: 'global',
    category: 'admin',
    label: 'Eklenti kurma, kaldırma ve açıp kapatma (eklentiler sunucuda kod çalıştırır)',
    defaults: {},
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'admin.customCode',
    scope: 'global',
    category: 'admin',
    label: 'Kod düzenleme (sayfa, tema ve ana sayfa blokları için HTML / CSS / JavaScript)',
    defaults: {},
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'board.view',
    scope: 'board',
    category: 'board',
    label: 'Bölümü görme ve okuma',
    defaults: { guest: 1, member: 1 },
    guestGrantable: true,
  },
  {
    key: 'topic.create',
    scope: 'board',
    category: 'board',
    label: 'Konu açma',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'post.reply',
    scope: 'board',
    category: 'board',
    label: 'Konulara yanıt yazma',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'post.edit.own',
    scope: 'board',
    category: 'board',
    label: 'Kendi mesajını düzenleme',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'post.delete.own',
    scope: 'board',
    category: 'board',
    label: 'Kendi mesajını silme',
    description: 'Konunun ilk mesajı silinemez; konuyu silmek için konu silme yetkisi gerekir.',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'topic.lock.own',
    scope: 'board',
    category: 'board',
    label: 'Kendi konusunu kilitleme',
    defaults: {},
    guestGrantable: false,
  },
  {
    key: 'topic.poll',
    scope: 'board',
    category: 'board',
    label: 'Konuya anket ekleme',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'poll.vote',
    scope: 'board',
    category: 'board',
    label: 'Anketlerde oy kullanma',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'post.images',
    scope: 'board',
    category: 'board',
    label: 'Mesaja görsel yükleme',
    defaults: { member: 1 },
    guestGrantable: false,
  },
  {
    key: 'post.noApproval',
    scope: 'board',
    category: 'board',
    label: 'Onaysız mesaj gönderme',
    description: 'Bölüm onay gerektiriyorsa bile mesajlar doğrudan yayınlanır.',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'mod.topic.pin',
    scope: 'board',
    category: 'board_moderation',
    label: 'Konu sabitleme ve öne çıkarma',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'mod.topic.lock',
    scope: 'board',
    category: 'board_moderation',
    label: 'Konu kilitleme',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'mod.topic.move',
    scope: 'board',
    category: 'board_moderation',
    label: 'Konu taşıma',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'mod.topic.merge',
    scope: 'board',
    category: 'board_moderation',
    label: 'Konu birleştirme',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'mod.topic.edit',
    scope: 'board',
    category: 'board_moderation',
    label: 'Konu başlığı ve öneki düzenleme',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'mod.topic.delete',
    scope: 'board',
    category: 'board_moderation',
    label: 'Konu silme',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
    dangerous: true,
  },
  {
    key: 'mod.post.edit',
    scope: 'board',
    category: 'board_moderation',
    label: 'Başkalarının mesajlarını düzenleme',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'mod.post.delete',
    scope: 'board',
    category: 'board_moderation',
    label: 'Başkalarının mesajlarını silme',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'mod.post.approve',
    scope: 'board',
    category: 'board_moderation',
    label: 'Onay bekleyen içeriği görme ve onaylama',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'mod.post.history',
    scope: 'board',
    category: 'board_moderation',
    label: 'Düzenleme geçmişini görme',
    defaults: { ...MODS, moderator: 1 },
    guestGrantable: false,
  },
  {
    key: 'mod.post.viewDeleted',
    scope: 'board',
    category: 'board_moderation',
    label: 'Silinmiş içeriği görme ve geri getirme',
    defaults: { ...MODS },
    guestGrantable: false,
  },
];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_MAP: ReadonlyMap<string, PermissionDefinition> = new Map(
  PERMISSIONS.map((p) => [p.key, p]),
);

export const GLOBAL_PERMISSIONS = PERMISSIONS.filter((p) => p.scope === 'global');
export const BOARD_PERMISSIONS = PERMISSIONS.filter((p) => p.scope === 'board');

export function isPermissionKey(key: string): boolean {
  return PERMISSION_MAP.has(key) || EXTRA_PERMISSIONS.has(key);
}

const EXTRA_PERMISSIONS = new Map<string, PermissionDefinition>();

export const EXTENSION_PERMISSION_CATEGORY: PermissionCategory = {
  key: 'extensions',
  label: 'Eklentiler',
  description: 'Kurulu eklentilerin tanımladığı yetkiler',
};

export function registerExtraPermissions(owner: string, defs: PermissionDefinition[]): void {
  clearExtraPermissions(owner);
  for (const d of defs) EXTRA_PERMISSIONS.set(d.key, { ...d, scope: 'global', category: 'extensions' });
}

export function clearExtraPermissions(owner: string): void {
  for (const key of [...EXTRA_PERMISSIONS.keys()]) if (key.startsWith(`ext.${owner}.`)) EXTRA_PERMISSIONS.delete(key);
}

export function permissionDef(key: string): PermissionDefinition | undefined {
  return PERMISSION_MAP.get(key) ?? EXTRA_PERMISSIONS.get(key);
}

export function allGlobalPermissions(): PermissionDefinition[] {
  return [...GLOBAL_PERMISSIONS, ...EXTRA_PERMISSIONS.values()];
}

export function extraPermissions(): PermissionDefinition[] {
  return [...EXTRA_PERMISSIONS.values()];
}

export function permissionRegistrySignature(): string {
  return PERMISSIONS.map((p) => `${p.key}:${JSON.stringify(p.defaults)}`)
    .sort()
    .join('|');
}
