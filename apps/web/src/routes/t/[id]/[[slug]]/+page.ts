import { redirect } from '@sveltejs/kit';
import type { TopicPage } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import { topicSeo } from '$lib/seo';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url, parent }) => {
  const page = url.searchParams.get('page') ?? '1';
  const topic = await apiLoad<TopicPage>(fetch, `/api/topics/${params.id}?page=${encodeURIComponent(page)}`, url);
  // Taşınmış konu bağlantısı ya da yanlış kısa ad: doğru adrese yönlendir.
  if (String(topic.topic.id) !== params.id || (params.slug && params.slug !== topic.topic.slug)) {
    redirect(301, `/t/${topic.topic.id}/${topic.topic.slug}${url.search}`);
  }
  // "unread" / "last": API doğru sayfayı döner; sayfa açılınca ilgili mesaja kaydırılır.
  const jumpTo =
    page === 'unread' ? (topic.firstUnreadPostId ?? topic.posts.items.at(-1)?.id ?? null) : page === 'last' ? (topic.posts.items.at(-1)?.id ?? null) : null;
  const { viewer } = await parent();
  return { topic, jumpTo, seo: topicSeo(topic, url.origin, viewer.settings) };
};
