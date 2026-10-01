import type { Paginated, UserSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export interface AdminUserRow {
  user: UserSummary;
  email: string;
  status: string;
  emailVerified: boolean;
  registeredAt: number;
  lastActiveAt: number | null;
  postCount: number;
  warningPoints: number;
  lastIp: string | null;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-users');
  const { access } = await parent();
  if (!access.elevated) return { list: null, groups: [] as GroupDto[] };
  const qs = new URLSearchParams();
  for (const k of ['q', 'status', 'group', 'sort', 'dir', 'page']) {
    const v = url.searchParams.get(k);
    if (v) qs.set(k, v);
  }
  const [list, groups] = await Promise.all([
    apiLoad<Paginated<AdminUserRow> & { counts: Record<string, number> }>(fetch, `/api/admin/users?${qs}`, url),
    apiLoad<GroupDto[]>(fetch, '/api/admin/groups', url).catch(() => [] as GroupDto[]),
  ]);
  return { list, groups };
};
