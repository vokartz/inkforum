import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, depends }) => {
  depends('app:2fa');
  return { status: await apiLoad<{ enabled: boolean; remainingRecoveryCodes: number }>(fetch, '/api/me/2fa', url) };
};
