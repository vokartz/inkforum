import type { ForumIndex, ThemeDetail } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, params, parent, depends }) => {
  depends('app:admin-theme');
  const { access } = await parent();
  if (!access.elevated) return { theme: null, boardPath: null, topicPath: null };
  const [theme, forum] = await Promise.all([
    apiLoad<ThemeDetail>(fetch, `/api/admin/themes/${params.id}`, url),
    apiLoad<ForumIndex>(fetch, '/api/forum', url).catch(() => null),
  ]);
  const boards = forum?.categories.flatMap((c) => c.boards).filter((b) => b.type === 'forum') ?? [];
  const board = boards[0];
  const last = boards.find((b) => b.lastPost)?.lastPost;
  return {
    theme,
    boardPath: board ? `/f/${board.id}/${board.slug}` : null,
    topicPath: last ? `/t/${last.topicId}/${last.topicSlug}` : null,
  };
};
