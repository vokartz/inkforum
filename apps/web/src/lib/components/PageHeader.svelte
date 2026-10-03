<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IconComponent } from '$lib/utils';

  interface Props {
    title: string;
    description?: string | null;
    icon?: IconComponent;
    actions?: Snippet;
    children?: Snippet;
  }
  let { title, description = null, icon: Icon, actions, children }: Props = $props();
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<div class="mb-7 flex flex-wrap items-start justify-between gap-4 animate-rise" data-part="page-header">
  <div class="flex min-w-0 items-start gap-3.5">
    {#if Icon}
      <span class="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Icon class="size-6" weight="duotone" /></span>
    {/if}
    <div class="min-w-0">
      <h1 class="text-[1.65rem] leading-tight font-extrabold tracking-tight">{title}</h1>
      {#if description}<p class="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>{/if}
      {@render children?.()}
    </div>
  </div>
  {#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
</div>
