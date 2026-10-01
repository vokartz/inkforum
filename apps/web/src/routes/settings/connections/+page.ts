import type { AuthorizedApp, LinkedIdentity } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, depends }) => {
  depends('app:connections');
  const [identities, apps, providers] = await Promise.all([
    apiLoad<LinkedIdentity[]>(fetch, '/api/me/identities', url),
    apiLoad<AuthorizedApp[]>(fetch, '/api/me/apps', url),
    fetch('/api/auth/social/providers')
      .then((r) => (r.ok ? (r.json() as Promise<Array<{ key: string; label: string }>>) : []))
      .catch(() => []),
  ]);
  return { identities, apps, providers };
};
