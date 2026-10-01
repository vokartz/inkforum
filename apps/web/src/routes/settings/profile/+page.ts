import { load as apiLoad } from '$lib/api';
import type { ProfileEditData } from '$lib/settings-types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => ({
  profile: await apiLoad<ProfileEditData>(fetch, '/api/me/profile', url),
});
