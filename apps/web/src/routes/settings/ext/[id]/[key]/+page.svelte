<script lang="ts">
  import CustomHtml from '$lib/components/CustomHtml.svelte';
  import { extMount } from '$lib/extensions';

  let { data } = $props();
  const v = $derived(data.view);
</script>

<svelte:head>
  <title>{v.title}</title>
  {#each v.styles as href (href)}<link rel="stylesheet" {href} />{/each}
</svelte:head>

<div class="grid gap-4" data-ext-account={v.ext}>
  <h1 class="text-2xl font-extrabold tracking-tight">{v.title}</h1>
  {#key `${v.ext}/${v.key}`}
    <div data-part="ext-account-page" use:extMount={{ ext: v.ext, scripts: v.scripts, data: v.data }}>
      <CustomHtml html={v.html} part="ext-account-html" />
    </div>
  {/key}
</div>
