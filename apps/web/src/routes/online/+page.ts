import type { OnlineSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => ({ online: await apiLoad<OnlineSummary>(fetch, '/api/online', url) });
