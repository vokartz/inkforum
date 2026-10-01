<script lang="ts">
  import type { NavEntry, Viewer } from '@forum/shared';
  import ModernHeader from './headers/ModernHeader.svelte';
  import CommunityHeader from './headers/CommunityHeader.svelte';
  import CenteredHeader from './headers/CenteredHeader.svelte';
  import { themeOptions } from '$lib/theme-options';
  import SearchDialog from './SearchDialog.svelte';

  let { viewer, nav }: { viewer: Viewer; nav: NavEntry[] } = $props();
  let searchOpen = $state(false);

  // Seçili temanın üst alanı (Yönetim → Görünüm → Tema)
  // Tema stüdyosundaki temanın üst alan seçimi; yoksa temel temaya göre
  const opts = $derived(themeOptions(viewer.settings));
  const style = $derived(opts ? { topbar: 'modern', banner: 'community', centered: 'centered' }[opts.header.style] : String(viewer.settings['appearance.themeStyle'] ?? 'modern'));
  const onsearch = () => (searchOpen = true);
</script>

{#if style === 'centered'}
  <CenteredHeader {viewer} {nav} {onsearch} />
{:else if style === 'community'}
  <CommunityHeader {viewer} {nav} {onsearch} />
{:else}
  <ModernHeader {viewer} {nav} {onsearch} />
{/if}

<SearchDialog bind:open={searchOpen} />
