import type { SessionInfo } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, depends }) => {
  depends('app:sessions');
  return { sessions: await apiLoad<SessionInfo[]>(fetch, '/api/me/sessions', url) };
};
