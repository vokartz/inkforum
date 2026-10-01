import type { GroupBadge, PolicyVersionPublic, UserSummary } from '@forum/shared';

export interface AchievementDto {
  id: number;
  key: string;
  categoryId: number | null;
  name: string;
  description: string;
  iconUrl: string | null;
  tier: number;
  tierLabel: string;
  seriesKey: string | null;
  points: number;
  isHidden: boolean;
  isActive: boolean;
  criteriaType: string | null;
  criteria: Record<string, unknown>;
  awardedCount: number;
  sortOrder: number;
}

export interface EarnedAchievement extends AchievementDto {
  awardedAt: number;
  source: 'auto' | 'manual' | 'backfill';
  reason: string | null;
  isFeatured: boolean;
}

export interface PublicProfile {
  user: UserSummary;
  status?: string;
  registeredAt: number;
  lastActiveAt: number | null;
  isOnline: boolean;
  postCount: number;
  achievementPoints: number;
  cover: { url: string; offset: number } | null;
  bioHtml: string;
  signatureHtml: string;
  location: string;
  websiteUrl: string;
  birthdate: string | null;
  age: number | null;
  groups: GroupBadge[];
  customFields: Array<{ key: string; name: string; type: string; value: string }>;
  warnings: { points: number; max: number } | null;
  achievements: { total: number; featured: EarnedAchievement[]; recent: EarnedAchievement[] };
  staff: { email: string | null; registeredIp: string | null; lastIp: string | null; watched: boolean } | null;
  can: { edit: boolean; warn: boolean; manage: boolean; cover: boolean };
}

export interface GroupDto {
  id: number;
  systemKey: string | null;
  name: string;
  description: string;
  color: string | null;
  iconUrl: string | null;
  iconCount: number;
  kind: 'regular' | 'post_count' | 'system';
  minPosts: number | null;
  joinType: 'closed' | 'requestable' | 'free';
  visibility: 'visible' | 'hidden' | 'additional_only';
  parentId: number | null;
  require2fa: boolean;
  isProtected: boolean;
  sortOrder: number;
  memberCount: number;
}

export interface WarningItem {
  id: number;
  points: number;
  reason: string;
  messageToUser: string | null;
  createdAt: number;
  expiresAt: number | null;
  isActive: boolean;
  revokedAt: number | null;
  issuedBy: UserSummary | null;
  notes?: string | null;
  revokeReason?: string | null;
}

export interface WarningStatus {
  points: number;
  maxPoints: number;
  watched: boolean;
  moderatedUntil: number | null;
  mutedUntil: number | null;
  whileAboveUntil: number;
}

export interface WarningTemplate {
  id: number;
  title: string;
  reasonTemplate: string;
  points: number;
  expiryDays: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface BanValue {
  name: string;
  reasonPublic: string | null;
  notesPrivate: string | null;
  cannotAccess: boolean;
  cannotLogin: boolean;
  cannotRegister: boolean;
  cannotPost: boolean;
  expiresAt: number | null;
  triggers: Array<{ type: string; value: string }>;
}

/** Kayıt formu bilgileri (GET /api/auth/register) */
export interface RegisterInfo {
  mode: 'open' | 'email' | 'approval' | 'email_approval' | 'closed';
  minAge: number;
  requireBirthdate: boolean;
  usernameMinLength: number;
  usernameMaxLength: number;
  passwordMinLength: number;
  passwordRequireMixed: boolean;
  policies: PolicyVersionPublic[];
  customFields: Array<{
    key: string;
    name: string;
    description: string;
    type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'url' | 'number' | 'date';
    options: string[];
    isRequired: boolean;
    maxLength: number;
  }>;
}
