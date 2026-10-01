<script lang="ts">
  import CustomPageContent from '$lib/components/CustomPageContent.svelte';

  let { data } = $props();
</script>

<CustomPageContent page={data.customPage} safeMode={data.safeMode} />
