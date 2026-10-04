import type { GroupsPageConfig } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-groups-page');
  const { access } = await parent();
  if (!access.elevated) return { config: null, groups: [] as GroupDto[] };
  const [config, groups] = await Promise.all([
    apiLoad<GroupsPageConfig>(fetch, '/api/admin/groups-page', url),
    apiLoad<GroupDto[]>(fetch, '/api/admin/groups', url),
  ]);
  return { config, groups };
};
