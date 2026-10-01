import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => ({
  history: await apiLoad<Array<{ id: number; key: string; title: string | null; version: number; accepted_at: number }>>(
    fetch,
    '/api/me/policies',
    url,
  ),
});
