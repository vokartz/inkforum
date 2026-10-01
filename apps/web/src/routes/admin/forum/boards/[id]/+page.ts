import { error } from '@sveltejs/kit';
import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { AdminForumTree } from '../../+page';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, params, parent, depends }) => {
  depends('app:admin-forum');
  const { access } = await parent();
  const isNew = params.id === 'new';
  if (!access.elevated) return { tree: null, groups: [] as GroupDto[], board: null, isNew };
  const [tree, groups] = await Promise.all([apiLoad<AdminForumTree>(fetch, '/api/admin/forum', url), apiLoad<GroupDto[]>(fetch, '/api/admin/groups', url)]);
  const board = isNew ? null : (tree.categories.flatMap((c) => c.boards).find((b) => String(b.id) === params.id) ?? null);
  if (!isNew && !board) error(404, { message: 'Bölüm bulunamadı.' });
  return { tree, groups, board, isNew };
};
