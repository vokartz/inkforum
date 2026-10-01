import type { AdminHomeBlock } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-home');
  const { access } = await parent();
  if (!access.elevated) return { blocks: null };
  const { blocks } = await apiLoad<{ blocks: AdminHomeBlock[] }>(fetch, '/api/admin/home', url);
  return { blocks };
};
