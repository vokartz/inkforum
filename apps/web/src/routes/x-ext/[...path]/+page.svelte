<script lang="ts">
  import ExtensionPageContent from '$lib/components/ExtensionPageContent.svelte';

  let { data } = $props();
</script>

<ExtensionPageContent page={data.extPage} />
