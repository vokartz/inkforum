import type { SessionInfo, UserSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { AchievementDto, EarnedAchievement, GroupDto, WarningItem } from '$lib/types';
import type { ProfileEditData } from '$lib/settings-types';
import type { PageLoad } from './$types';

export interface AdminBan {
  id: number;
  name: string;
  reasonPublic: string | null;
  notesPrivate: string | null;
  cannotAccess: boolean;
  cannotLogin: boolean;
  cannotRegister: boolean;
  cannotPost: boolean;
  expiresAt: number | null;
  liftedAt: number | null;
  source: string;
  createdAt: number;
  isActive: boolean;
  triggers: Array<{ id: number; type: string; value: string; userId: number | null; hits: number; lastHitAt: number | null }>;
}

export interface AdminUserDetail {
  summary: UserSummary;
  email: string;
  emailVerifiedAt: number | null;
  status: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  postCount: number;
  warningPoints: number;
  achievementPoints: number;
  isWatched: boolean;
  moderatedUntil: number | null;
  mutedUntil: number | null;
  registeredAt: number;
  registeredIp: string | null;
  lastLoginAt: number | null;
  lastActiveAt: number | null;
  lastIp: string | null;
  approvedAt: number | null;
  memberships: {
    primary: GroupDto | null;
    primaryExpiresAt: number | null;
    postGroup: GroupDto | null;
    additional: Array<{ group: GroupDto; source: string; addedAt: number; expiresAt: number | null }>;
  };
  sessions: SessionInfo[];
  notes: Array<{ id: number; body: string; createdAt: number; author: UserSummary | null }> | null;
  nameHistory: Array<{ oldUsername: string; newUsername: string; oldDisplayName: string; newDisplayName: string; changedAt: number }>;
  logs: Array<{ id: number; type: string; action: string; actorId: number | null; createdAt: number; ip: string | null }>;
  profile: ProfileEditData;
  bans: AdminBan[];
  achievements: EarnedAchievement[];
  warnings: WarningItem[] | null;
  twoFactorEnabled: boolean;
}

export const load: PageLoad = async ({ fetch, url, params, parent, depends }) => {
  depends('app:admin-user');
  const { access } = await parent();
  if (!access.elevated) return { detail: null, groups: [] as GroupDto[], achievements: [] as AchievementDto[] };
  const [detail, groups, achievements] = await Promise.all([
    apiLoad<AdminUserDetail>(fetch, `/api/admin/users/${params.id}`, url),
    apiLoad<GroupDto[]>(fetch, '/api/admin/groups', url).catch(() => [] as GroupDto[]),
    apiLoad<{ items: AchievementDto[] }>(fetch, '/api/admin/achievements', url)
      .then((r) => r.items)
      .catch(() => [] as AchievementDto[]),
  ]);
  return { detail, groups, achievements };
};
