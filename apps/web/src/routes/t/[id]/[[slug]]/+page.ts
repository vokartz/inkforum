import { redirect } from '@sveltejs/kit';
import type { ExtensionTopicSlots, TopicPage } from '@forum/shared';
import { load as apiLoad, request } from '$lib/api';
import { topicSeo } from '$lib/seo';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url, parent }) => {
  const page = url.searchParams.get('page') ?? '1';
  const topic = await apiLoad<TopicPage>(fetch, `/api/topics/${params.id}?page=${encodeURIComponent(page)}`, url);
  if (String(topic.topic.id) !== params.id || (params.slug && params.slug !== topic.topic.slug)) {
    redirect(301, `/t/${topic.topic.id}/${topic.topic.slug}${url.search}`);
  }
  const jumpTo =
    page === 'unread' ? (topic.firstUnreadPostId ?? topic.posts.items.at(-1)?.id ?? null) : page === 'last' ? (topic.posts.items.at(-1)?.id ?? null) : null;
  const { viewer, safeMode } = await parent();
  const ids = topic.posts.items.map((p) => p.id).join(',');
  const extSlots = safeMode ? null : await request<ExtensionTopicSlots>(fetch, `/api/extensions/topic/${topic.topic.id}?posts=${ids}`).catch(() => null);
  return { topic, jumpTo, extSlots, seo: topicSeo(topic, url.origin, viewer.settings) };
};
