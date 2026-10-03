import type { ForumIndex, HomeLayout, RecentTopicItem, UserSummary } from '@forum/shared';
import { load as apiLoad, request } from '$lib/api';

export interface ForumIndexData {
  forum: ForumIndex;
  home: HomeLayout;
  recent: RecentTopicItem[];
  birthdays: UserSummary[];
}

export async function loadForumIndex(fetch: typeof globalThis.fetch, url: URL): Promise<ForumIndexData> {
  const safe = <T>(p: Promise<T>) => p.catch(() => null);
  const empty: HomeLayout = { top: [], sidebar: [], bottom: [] };
  const [forum, home] = await Promise.all([apiLoad<ForumIndex>(fetch, '/api/forum', url), safe(request<HomeLayout>(fetch, '/api/home'))]);
  const blocks = [...(home ?? empty).top, ...(home ?? empty).sidebar, ...(home ?? empty).bottom];
  const limit = Math.max(0, ...blocks.map((b) => (b.kind === 'recent' ? b.limit : 0)));
  const [recent, birthdays] = await Promise.all([
    limit > 0 ? safe(request<RecentTopicItem[]>(fetch, `/api/forum/recent?limit=${limit}`)) : null,
    blocks.some((b) => b.kind === 'birthdays') ? safe(request<UserSummary[]>(fetch, '/api/birthdays')) : null,
  ]);
  return { forum, home: home ?? empty, recent: recent ?? [], birthdays: birthdays ?? [] };
}
