import type { SocialSignupInfo } from '@forum/shared';
import type { RegisterInfo } from '$lib/types';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
  const pending = await fetch('/api/auth/social/pending')
    .then((r) => (r.ok ? (r.json() as Promise<SocialSignupInfo>) : null))
    .catch(() => null);
  const info = await apiLoad<RegisterInfo>(fetch, '/api/auth/register', url);
  return { pending, info };
};
