import { load as apiLoad } from '$lib/api';
import type { WarningItem, WarningStatus } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => ({
  warnings: await apiLoad<{ status: WarningStatus; items: WarningItem[] }>(fetch, '/api/me/warnings', url),
});
