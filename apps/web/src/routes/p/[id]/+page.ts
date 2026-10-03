import { redirect } from '@sveltejs/kit';
import type { PostLocation } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => {
  const loc = await apiLoad<PostLocation>(fetch, `/api/posts/${params.id}/locate`, url);
  redirect(302, `/t/${loc.topicId}/${loc.topicSlug}${loc.page > 1 ? `?page=${loc.page}` : ''}#post-${loc.postId}`);
};
