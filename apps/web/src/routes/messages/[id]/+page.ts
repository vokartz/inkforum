import type { ConversationDetail } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, params, depends }) => {
  depends('app:conversation');
  const page = url.searchParams.get('sayfa') ?? 'last';
  return {
    conversation: await apiLoad<ConversationDetail>(fetch, `/api/messages/${params.id}?page=${page}`, url),
  };
};
