import type { CustomEmbedProvider, EmbedProviderInfo } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface EmbedSettings {
  providers: EmbedProviderInfo[];
  enabled: boolean;
  autoEmbed: boolean;
  clickToLoad: boolean;
  disabledProviders: string[];
  custom: CustomEmbedProvider[];
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-embeds');
  const { access } = await parent();
  if (!access.elevated) return { embeds: null };
  return { embeds: await apiLoad<EmbedSettings>(fetch, '/api/admin/embeds', url) };
};
