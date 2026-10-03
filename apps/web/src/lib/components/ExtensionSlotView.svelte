<script lang="ts">
  import type { ExtensionSlotItem } from '@forum/shared';
  import CustomHtml from '$lib/components/CustomHtml.svelte';
  import { extMount } from '$lib/extensions';
  import { cn } from '$lib/utils';

  let { items, key, card = false, class: className }: { items: ExtensionSlotItem[]; key: string; card?: boolean; class?: string } = $props();
</script>

{#each items as it (`${it.ext}:${it.key}`)}
  <div
    class={cn(card && 'rounded-xl border bg-card p-4', className)}
    data-part="ext-slot"
    data-ext={it.ext}
    data-slot={key}
    use:extMount={{ ext: it.ext, scripts: it.scripts }}
  >
    {#if card && it.title}<h3 class="mb-2 text-sm font-bold">{it.title}</h3>{/if}
    <CustomHtml html={it.html} part="ext-slot-html" />
  </div>
{/each}
