import type { AdminCustomCode } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-custom');
  const { access } = await parent();
  if (!access.elevated) return { custom: null, groups: [] as GroupDto[] };
  const [custom, groups] = await Promise.all([apiLoad<AdminCustomCode>(fetch, '/api/admin/custom', url), apiLoad<GroupDto[]>(fetch, '/api/admin/groups', url)]);
  return { custom, groups };
};
