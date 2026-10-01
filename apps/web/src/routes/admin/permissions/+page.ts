import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export interface PermissionMatrix {
  categories: Array<{ key: string; label: string; description?: string }>;
  permissions: Array<{ key: string; scope: string; category: string; label: string; description: string | null; guestGrantable: boolean; dangerous: boolean }>;
  groups: Array<GroupDto & { editable: boolean; inheritsFrom: number | null }>;
  values: Record<string, Record<string, 1 | -1>>;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-permissions');
  const { access } = await parent();
  if (!access.elevated) return { matrix: null };
  return { matrix: await apiLoad<PermissionMatrix>(fetch, '/api/admin/permissions', url) };
};
