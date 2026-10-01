import type { ApplicationItem, Paginated } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
  const status = url.searchParams.get('status') ?? 'open';
  const form = url.searchParams.get('form') ?? '';
  const page = url.searchParams.get('page') ?? '1';
  const qs = new URLSearchParams({ status, page, ...(form ? { form } : {}) });
  const res = await apiLoad<Paginated<ApplicationItem> & { forms: Array<{ id: number; title: string; pending: number }> }>(fetch, `/api/applications/review?${qs}`, url);
  return { res, status, form };
};
