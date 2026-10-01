import type { PolicySummary, PolicyVersionPublic } from '@forum/shared';
import { plainExcerpt } from '@forum/shared';
import { load as apiLoad, request } from '$lib/api';
import { articleSeo } from '$lib/seo';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => {
  const [policy, list] = await Promise.all([
    apiLoad<PolicyVersionPublic>(fetch, `/api/policies/${encodeURIComponent(params.key)}`, url),
    request<{ items: PolicySummary[] }>(fetch, '/api/policies').catch(() => ({ items: [] as PolicySummary[] })),
  ]);
  const seo = articleSeo({ title: policy.title, description: plainExcerpt(policy.bodyHtml, 180), path: `/policies/${policy.key}`, origin: url.origin, updatedAt: policy.publishedAt ?? undefined });
  return { policy, policies: list.items, seo };
};
