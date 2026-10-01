import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export type VisibleGroup = GroupDto & { isMember: boolean; hasPendingRequest: boolean };

export const load: PageLoad = async ({ fetch, url }) => ({
  groups: await apiLoad<VisibleGroup[]>(fetch, '/api/groups', url),
});
