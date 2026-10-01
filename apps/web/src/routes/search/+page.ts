import type { ForumIndex, SearchResults } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

const KEYS = ['q', 'type', 'titleOnly', 'board', 'tag', 'author', 'since', 'sort', 'page'] as const;

export const load: PageLoad = async ({ fetch, url }) => {
  const params = new URLSearchParams();
  for (const k of KEYS) {
    const v = url.searchParams.get(k);
    if (v) params.set(k, v);
  }
  const q = url.searchParams.get('q')?.trim() ?? '';
  const active = q.length >= 2 || !!(url.searchParams.get('tag') || url.searchParams.get('author') || url.searchParams.get('board'));
  const [results, forum] = await Promise.all([
    active ? apiLoad<SearchResults>(fetch, `/api/search?${params}`, url) : Promise.resolve(null),
    apiLoad<ForumIndex>(fetch, '/api/forum', url).catch(() => null),
  ]);
  const boards = (forum?.categories ?? []).flatMap((c) =>
    c.boards.filter((b) => b.type === 'forum').flatMap((b) => [{ id: b.id, name: b.name, group: c.name }, ...b.children.filter((ch) => ch.type === 'forum').map((ch) => ({ id: ch.id, name: `${b.name} › ${ch.name}`, group: c.name }))]),
  );
  return { q, results, boards };
};
