import type { PermissionProfileSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-profiles');
  const { access } = await parent();
  if (!access.elevated) return { profiles: null };
  return { profiles: await apiLoad<PermissionProfileSummary[]>(fetch, '/api/admin/forum/profiles', url) };
};
