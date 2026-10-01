import type { Paginated, UserSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface MemberRow {
  user: UserSummary;
  registeredAt: number;
  postCount: number;
  achievementPoints: number;
  lastActiveAt: number | null;
}

export interface GroupOption {
  id: number;
  name: string;
  kind: string;
  isMember: boolean;
}

export const load: PageLoad = async ({ fetch, url }) => {
  const qs = new URLSearchParams();
  for (const key of ['q', 'group', 'sort', 'dir', 'page']) {
    const v = url.searchParams.get(key);
    if (v) qs.set(key, v);
  }
  const [members, groups] = await Promise.all([
    apiLoad<Paginated<MemberRow>>(fetch, `/api/members?${qs}`, url),
    apiLoad<GroupOption[]>(fetch, '/api/groups', url).catch(() => [] as GroupOption[]),
  ]);
  return { members, groups };
};
