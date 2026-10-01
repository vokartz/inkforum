<script lang="ts">
  import type { Snippet } from 'svelte';
  import InboxIcon from 'phosphor-svelte/lib/Tray';

  interface Props {
    title: string;
    description?: string;
    children?: Snippet;
  }
  let { title, description, children }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
  <InboxIcon class="mb-3 size-8 text-muted-foreground" />
  <p class="font-medium">{title}</p>
  {#if description}<p class="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>{/if}
  {#if children}<div class="mt-4">{@render children()}</div>{/if}
</div>
