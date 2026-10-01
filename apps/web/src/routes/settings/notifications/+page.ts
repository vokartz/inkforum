import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => ({
  prefs: await apiLoad<Array<{ type: string; label: string; enabled: boolean }>>(fetch, '/api/me/notifications/preferences', url),
});
