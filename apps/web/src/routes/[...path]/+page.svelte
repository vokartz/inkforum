<script lang="ts">
  import CustomPageContent from '$lib/components/CustomPageContent.svelte';
  import ExtensionPageContent from '$lib/components/ExtensionPageContent.svelte';

  let { data } = $props();
</script>

{#if data.extPage}
  <ExtensionPageContent page={data.extPage} />
{:else if data.customPage}
  <CustomPageContent page={data.customPage} safeMode={data.safeMode} />
{/if}
