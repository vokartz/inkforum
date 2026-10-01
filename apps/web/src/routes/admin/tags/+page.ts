import type { Paginated, TagSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-tags');
  const { access } = await parent();
  if (!access.elevated) return { tags: null, q: '' };
  const q = url.searchParams.get('q') ?? '';
  const page = Number(url.searchParams.get('page')) || 1;
  const tags = await apiLoad<Paginated<TagSummary>>(fetch, `/api/admin/tags?q=${encodeURIComponent(q)}&page=${page}`, url);
  return { tags, q };
};
