import { error } from '@sveltejs/kit';
import { load as apiLoad } from '$lib/api';
import { t } from '$lib/i18n.svelte';
import type { AdminPolicy } from '../+page';
import type { PageLoad } from './$types';

export interface PolicyVersionDetail {
  id: number;
  policyId: number;
  key: string;
  version: number;
  requiresReacceptance: boolean;
  changeNote: string | null;
  publishedAt: number | null;
  title: string;
  bodyMd: string;
  bodyHtml: string;
}

export const load: PageLoad = async ({ fetch, url, params, parent, depends }) => {
  depends('app:admin-policy');
  const { access } = await parent();
  if (!access.elevated) return { policy: null, latest: null };
  const all = await apiLoad<AdminPolicy[]>(fetch, '/api/admin/policies', url);
  const policy = all.find((p) => String(p.id) === params.id);
  if (!policy) error(404, { message: t('Politika bulunamadı.') });
  const latestId = policy.versions[0]?.id;
  const latest = latestId ? await apiLoad<PolicyVersionDetail>(fetch, `/api/admin/policy-versions/${latestId}`, url) : null;
  return { policy, latest };
};
