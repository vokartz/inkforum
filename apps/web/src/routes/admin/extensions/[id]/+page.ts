import type { AdminExtensionDetail } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, params, parent, depends }) => {
  depends('app:admin-extension');
  const { access } = await parent();
  if (!access.elevated) return { detail: null, groups: [] as GroupDto[] };
  const detail = await apiLoad<AdminExtensionDetail>(fetch, `/api/admin/extensions/${params.id}`, url);
  const needsGroups = detail.fields.some((f) => f.type === 'groups');
  const groups = needsGroups ? await apiLoad<GroupDto[]>(fetch, '/api/admin/groups', url).catch(() => [] as GroupDto[]) : [];
  return { detail, groups };
};
