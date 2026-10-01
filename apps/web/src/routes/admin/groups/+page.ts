import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-groups');
  const { access } = await parent();
  if (!access.elevated) return { groups: [] as GroupDto[] };
  return { groups: await apiLoad<GroupDto[]>(fetch, '/api/admin/groups', url) };
};
