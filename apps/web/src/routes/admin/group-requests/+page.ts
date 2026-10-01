import type { UserSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-requests');
  const { access } = await parent();
  if (!access.elevated) return { requests: [] };
  return {
    requests: await apiLoad<Array<{ id: number; groupId: number; groupName: string; user: UserSummary; reason: string; createdAt: number }>>(
      fetch,
      '/api/admin/group-requests',
      url,
    ),
  };
};
