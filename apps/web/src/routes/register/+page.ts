import type { RegisterInfo } from '$lib/types';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
  const [info, providers] = await Promise.all([
    apiLoad<RegisterInfo>(fetch, '/api/auth/register', url),
    fetch('/api/auth/social/providers')
      .then((r) => (r.ok ? (r.json() as Promise<Array<{ key: string; label: string }>>) : []))
      .catch(() => []),
  ]);
  return { info, providers };
};
