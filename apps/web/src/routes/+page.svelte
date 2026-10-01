<script lang="ts">
  import ForumIndexView from '$lib/components/forum/ForumIndexView.svelte';
  import CustomPageContent from '$lib/components/CustomPageContent.svelte';

  let { data } = $props();
</script>

{#if data.landing}
  <CustomPageContent page={data.landing} safeMode={data.safeMode} />
{:else if data.index}
  <ForumIndexView data={{ ...data.index, viewer: data.viewer }} />
{/if}
