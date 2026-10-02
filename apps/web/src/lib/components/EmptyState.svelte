<script lang="ts">
  import type { Snippet } from 'svelte';
  import InboxIcon from 'phosphor-svelte/lib/Tray';
  import type { IconComponent } from '$lib/utils';

  interface Props {
    title: string;
    icon?: IconComponent;
    description?: string;
    children?: Snippet;
  }
  let { title, icon: Icon = InboxIcon, description, children }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
  <Icon class="mb-3 size-8 text-muted-foreground" weight="duotone" />
  <p class="font-medium">{title}</p>
  {#if description}<p class="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>{/if}
  {#if children}<div class="mt-4">{@render children()}</div>{/if}
</div>
