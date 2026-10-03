import type { AdminPlugin, ExtensionSample, ExtensionsOverview } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-extensions');
  const { access } = await parent();
  if (!access.elevated) return { overview: null, builtin: null, samples: [] as ExtensionSample[] };
  const [overview, builtin, samples] = await Promise.all([
    apiLoad<ExtensionsOverview>(fetch, '/api/admin/extensions', url),
    apiLoad<{ items: AdminPlugin[] }>(fetch, '/api/admin/plugins', url),
    apiLoad<ExtensionSample[]>(fetch, '/api/admin/extensions/samples', url).catch(() => [] as ExtensionSample[]),
  ]);
  return { overview, builtin: builtin.items, samples };
};
