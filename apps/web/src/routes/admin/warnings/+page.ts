import type { Paginated, UserSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import { can } from '$lib/viewer';
import type { WarningTemplate } from '$lib/types';
import type { PageLoad } from './$types';

export interface WarningAction {
  id: number;
  thresholdPoints: number;
  action: 'watch' | 'moderate' | 'mute' | 'temp_ban';
  actionLabel: string;
  mode: 'while_above' | 'timed';
  durationDays: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface RecentWarning {
  id: number;
  user: UserSummary | null;
  issuedBy: UserSummary | null;
  points: number;
  reason: string;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
  expiredAt: number | null;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-warnings');
  const { access, viewer } = await parent();
  if (!access.elevated) return { recent: null, config: null };
  const page = url.searchParams.get('page') ?? '1';
  const [recent, config] = await Promise.all([
    can(viewer, 'mod.warnings.view') ? apiLoad<Paginated<RecentWarning>>(fetch, `/api/mod/warnings?page=${page}&perPage=25`, url) : null,
    can(viewer, 'admin.warnings.manage')
      ? apiLoad<{ templates: WarningTemplate[]; actions: WarningAction[] }>(fetch, '/api/admin/warnings/config', url)
      : null,
  ]);
  return { recent, config };
};
