import type { PublicSettings } from './settings.js';

/** API yanıt tipleri — sunucu ve istemci ortak kullanır. Tüm zamanlar epoch ms. */

export interface GroupBadge {
  id: number;
  name: string;
  color: string | null;
  iconUrl: string | null;
  iconCount: number;
}

export interface UserSummary {
  id: number;
  username: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  /** Baskın grubun rengi (isim bu renkte gösterilir). */
  color: string | null;
  customTitle: string | null;
  /** Baskın (görünen) grup. */
  primaryGroup: GroupBadge | null;
}

export type UserStatus = 'active' | 'pending_email' | 'pending_approval' | 'deactivated';

export interface PendingPolicy {
  policyId: number;
  key: string;
  versionId: number;
  version: number;
  title: string;
  changeNote: string | null;
}

export interface ViewerBan {
  reason: string | null;
  expiresAt: number | null;
  cannotPost: boolean;
  cannotAccess: boolean;
}

export interface ViewerUser extends UserSummary {
  email: string;
  emailVerified: boolean;
  status: UserStatus;
  timezone: string;
  /** Üyenin seçtiği arayüz dili ('' = otomatik) */
  language: string;
  theme: 'system' | 'light' | 'dark';
  warningPoints: number;
  achievementPoints: number;
  unreadNotifications: number;
  /** Okunmamış özel mesaj konuşması */
  unreadMessages: number;
  /** Sosyal girişle açılmış hesaplarda şifre olmayabilir */
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  groups: GroupBadge[];
  elevatedUntil: number | null;
  mutedUntil: number | null;
}

export interface ViewerFlags {
  mustChangePassword: boolean;
  pendingPolicies: PendingPolicy[];
  emailUnverified: boolean;
  twoFactorSetupRequired: boolean;
  ban: ViewerBan | null;
}

export interface Viewer {
  user: ViewerUser | null;
  isAdmin: boolean;
  permissions: string[];
  flags: ViewerFlags;
  settings: PublicSettings;
  /** Etkin arayüz dili */
  locale: import('./i18n.js').Locale;
  now: number;
}

export interface SessionInfo {
  id: number;
  current: boolean;
  persistent: boolean;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  ip: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
}

export interface LoginResult {
  status: 'ok' | 'two_factor_required';
  challenge?: string;
}

export interface RegisterResult {
  status: 'active' | 'pending_email' | 'pending_approval';
  userId: number;
}

export interface PolicyVersionPublic {
  policyId: number;
  key: string;
  versionId: number;
  version: number;
  title: string;
  bodyMd: string;
  bodyHtml: string;
  isRequired: boolean;
  publishedAt: number | null;
  changeNote: string | null;
  /** Yayımlanmış sürümler (yeniden eskiye) */
  history?: Array<{ version: number; publishedAt: number; changeNote: string | null; requiresReacceptance: boolean }>;
  /** Giriş yapmış üyenin bu politikayı en son kabul ettiği sürüm */
  accepted?: { version: number; at: number } | null;
}

/** Politika menüsü (yasal sayfalar kenar çubuğu) */
export interface PolicySummary {
  key: string;
  title: string;
  version: number;
  publishedAt: number;
  isRequired: boolean;
}
