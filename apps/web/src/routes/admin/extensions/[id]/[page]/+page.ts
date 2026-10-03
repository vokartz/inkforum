import type { ExtensionAdminPageView } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, params, parent }) => {
  const { access } = await parent();
  if (!access.elevated) return { view: null };
  const query = url.search ? url.search : '';
  return { view: await apiLoad<ExtensionAdminPageView>(fetch, `/api/admin/extensions/${params.id}/pages/${params.page}${query}`, url) };
};
