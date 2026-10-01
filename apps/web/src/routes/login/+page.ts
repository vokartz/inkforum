import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const providers = await fetch('/api/auth/social/providers')
    .then((r) => (r.ok ? (r.json() as Promise<Array<{ key: string; label: string }>>) : []))
    .catch(() => []);
  return { providers };
};
