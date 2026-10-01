import type { TopicEmbed } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => {
  const card = await apiLoad<TopicEmbed>(fetch, `/api/embed/topics/${encodeURIComponent(params.id)}`, url);
  return { card, bare: true, seo: { title: card.title, noindex: true } };
};
