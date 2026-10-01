import type { Paginated, UserSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export interface GroupDetail extends GroupDto {
  isMember: boolean;
  isPrimary: boolean;
  hasPendingRequest: boolean;
  canManage: boolean;
  moderators: UserSummary[];
}

export interface GroupMember {
  user: UserSummary;
  isPrimary: boolean;
  expiresAt: number | null;
  addedAt: number;
}

export const load: PageLoad = async ({ fetch, params, url }) => {
  const page = url.searchParams.get('page') ?? '1';
  const [group, members] = await Promise.all([
    apiLoad<GroupDetail>(fetch, `/api/groups/${params.id}`, url),
    apiLoad<Paginated<GroupMember>>(fetch, `/api/groups/${params.id}/members?page=${page}&perPage=30`, url),
  ]);
  return { group, members };
};
