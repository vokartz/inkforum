<script lang="ts">
  import type { NavEntry, Viewer } from '@forum/shared';
  import ModernHeader from './headers/ModernHeader.svelte';
  import CommunityHeader from './headers/CommunityHeader.svelte';
  import ClassicHeader from './headers/ClassicHeader.svelte';
  import SearchDialog from './SearchDialog.svelte';

  let { viewer, nav }: { viewer: Viewer; nav: NavEntry[] } = $props();
  let searchOpen = $state(false);

  // Seçili temanın üst alanı (Yönetim → Görünüm → Tema)
  const style = $derived(String(viewer.settings['appearance.themeStyle'] ?? 'modern'));
  const onsearch = () => (searchOpen = true);
</script>

{#if style === 'classic'}
  <ClassicHeader {viewer} {nav} {onsearch} />
{:else if style === 'community'}
  <CommunityHeader {viewer} {nav} {onsearch} />
{:else}
  <ModernHeader {viewer} {nav} {onsearch} />
{/if}

<SearchDialog bind:open={searchOpen} />
