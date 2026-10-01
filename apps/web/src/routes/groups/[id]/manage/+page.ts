import type { Paginated, UserSummary } from '@forum/shared';
import { error } from '@sveltejs/kit';
import { load as apiLoad } from '$lib/api';
import type { GroupDetail, GroupMember } from '../+page';
import type { PageLoad } from './$types';

export interface JoinRequest {
  id: number;
  user: UserSummary;
  reason: string;
  createdAt: number;
}

export const load: PageLoad = async ({ fetch, params, url }) => {
  const group = await apiLoad<GroupDetail>(fetch, `/api/groups/${params.id}`, url);
  if (!group.canManage) error(403, { message: 'Bu grubu yönetme yetkiniz yok.' });
  const page = url.searchParams.get('page') ?? '1';
  const [requests, members] = await Promise.all([
    apiLoad<JoinRequest[]>(fetch, `/api/groups/${params.id}/requests`, url),
    apiLoad<Paginated<GroupMember>>(fetch, `/api/groups/${params.id}/members?page=${page}&perPage=30`, url),
  ]);
  return { group, requests, members };
};
