import type { Paginated, UserSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export interface AdminGroupDetail extends GroupDto {
  moderators: UserSummary[];
  requests: Array<{ id: number; user: UserSummary; reason: string; createdAt: number }>;
}

export const load: PageLoad = async ({ fetch, url, params, parent, depends }) => {
  depends('app:admin-group');
  const { access } = await parent();
  const isNew = params.id === 'new';
  if (!access.elevated) return { group: null, groups: [] as GroupDto[], members: null, isNew };
  const groups = await apiLoad<GroupDto[]>(fetch, '/api/admin/groups', url);
  if (isNew) return { group: null, groups, members: null, isNew };
  const page = url.searchParams.get('page') ?? '1';
  const [group, members] = await Promise.all([
    apiLoad<AdminGroupDetail>(fetch, `/api/admin/groups/${params.id}`, url),
    apiLoad<Paginated<{ user: UserSummary; isPrimary: boolean; expiresAt: number | null; addedAt: number }>>(
      fetch,
      `/api/admin/groups/${params.id}/members?page=${page}&perPage=25`,
      url,
    ),
  ]);
  return { group, groups, members, isNew };
};
