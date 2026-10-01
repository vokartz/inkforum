import type { PermissionProfileSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { MatrixGroup, MatrixPermission } from '$lib/components/admin/PermissionMatrix.svelte';
import type { PageLoad } from './$types';

export interface ProfileMatrix {
  profile: PermissionProfileSummary;
  boards: Array<{ id: number; name: string }>;
  categories: Array<{ key: string; label: string; description?: string }>;
  permissions: MatrixPermission[];
  groups: MatrixGroup[];
  values: Record<string, Record<string, number>>;
}

export const load: PageLoad = async ({ fetch, url, params, parent, depends }) => {
  depends('app:admin-profile');
  const { access } = await parent();
  if (!access.elevated) return { matrix: null };
  return { matrix: await apiLoad<ProfileMatrix>(fetch, `/api/admin/forum/profiles/${params.id}`, url) };
};
