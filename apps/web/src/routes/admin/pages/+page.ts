import type { AdminCustomPage } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-pages');
  const { access } = await parent();
  if (!access.elevated) return { pages: null, canCode: false, landingSlug: null };
  return apiLoad<{ pages: AdminCustomPage[]; canCode: boolean; landingSlug: string | null }>(fetch, '/api/admin/pages', url);
};
