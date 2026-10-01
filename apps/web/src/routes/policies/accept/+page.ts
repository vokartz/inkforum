import type { PolicyVersionPublic } from '@forum/shared';
import { redirect } from '@sveltejs/kit';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, parent, url }) => {
  const { viewer } = await parent();
  if (!viewer.user) redirect(303, '/login');
  const pending = viewer.flags.pendingPolicies;
  const policies = await Promise.all(pending.map((p) => apiLoad<PolicyVersionPublic>(fetch, `/api/policies/${p.key}`, url)));
  return { policies };
};
