import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface AdminPolicy {
  id: number;
  key: string;
  isRequired: boolean;
  showOnRegister: boolean;
  isActive: boolean;
  sortOrder: number;
  versions: Array<{
    id: number;
    version: number;
    title: string;
    requiresReacceptance: boolean;
    changeNote: string | null;
    publishedAt: number | null;
    createdAt: number;
    acceptances: number;
  }>;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-policies');
  const { access } = await parent();
  if (!access.elevated) return { policies: [] as AdminPolicy[] };
  return { policies: await apiLoad<AdminPolicy[]>(fetch, '/api/admin/policies', url) };
};
