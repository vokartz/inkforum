import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export interface MyGroups {
  primary: GroupDto | null;
  primaryExpiresAt: number | null;
  postGroup: GroupDto | null;
  additional: Array<{ group: GroupDto; source: string; addedAt: number; expiresAt: number | null }>;
  joinable: Array<GroupDto & { hasPendingRequest: boolean }>;
}

export const load: PageLoad = async ({ fetch, url }) => ({
  groups: await apiLoad<MyGroups>(fetch, '/api/me/groups', url),
});
