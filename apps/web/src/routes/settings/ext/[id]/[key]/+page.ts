import type { ExtensionAdminPageView } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, params }) => ({
  view: await apiLoad<ExtensionAdminPageView>(fetch, `/api/extensions/account/${params.id}/${params.key}${url.search}`, url),
});
