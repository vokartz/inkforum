import type { GroupsPageData } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => ({
  page: await apiLoad<GroupsPageData>(fetch, '/api/groups/page', url),
});
