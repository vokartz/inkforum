import type { PublicSettings } from './settings.js';

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
  color: string | null;
  customTitle: string | null;
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
  language: string;
  theme: 'system' | 'light' | 'dark';
  warningPoints: number;
  achievementPoints: number;
  unreadNotifications: number;
  unreadMessages: number;
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
  history?: Array<{ version: number; publishedAt: number; changeNote: string | null; requiresReacceptance: boolean }>;
  accepted?: { version: number; at: number } | null;
}

export interface PolicySummary {
  key: string;
  title: string;
  version: number;
  publishedAt: number;
  isRequired: boolean;
}
