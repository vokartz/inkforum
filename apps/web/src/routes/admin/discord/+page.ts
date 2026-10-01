import type { ForumIndex } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface DiscordAdmin {
  hasWebhook: boolean;
  boardIds: number[];
  replies: boolean;
  guildId: string;
  inviteUrl: string;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-discord');
  const { access } = await parent();
  if (!access.elevated) return { discord: null, forum: null };
  const [discord, forum] = await Promise.all([
    apiLoad<DiscordAdmin>(fetch, '/api/admin/discord', url),
    apiLoad<ForumIndex>(fetch, '/api/forum', url),
  ]);
  return { discord, forum };
};
