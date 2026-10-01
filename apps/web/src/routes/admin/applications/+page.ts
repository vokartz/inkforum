import type { AdminApplicationForm } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-applications');
  const { access } = await parent();
  if (!access.elevated) return { items: null };
  const { items } = await apiLoad<{ items: AdminApplicationForm[] }>(fetch, '/api/admin/application-forms', url);
  return { items };
};
