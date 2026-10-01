import type { UpdateStatus } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export type AdminUpdates = UpdateStatus & { hasPrevious: boolean };

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-updates');
  const { access } = await parent();
  if (!access.elevated) return { updates: null };
  return { updates: await apiLoad<AdminUpdates>(fetch, '/api/admin/updates', url) };
};
