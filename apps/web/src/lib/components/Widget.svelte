<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn, type IconComponent } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    title: string;
    icon?: IconComponent;
    href?: string | null;
    hrefLabel?: string;
    class?: string;
    flush?: boolean;
    children: Snippet;
  }
  let { title, icon: Icon, href = null, hrefLabel = t('Tümü'), class: className, flush = false, children }: Props = $props();
</script>

<section data-part="widget" class={cn('overflow-hidden rounded-2xl border bg-card shadow-card', className)}>
  <header class="flex items-center gap-2.5 px-4 pt-4 pb-2">
    {#if Icon}
      <span class="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon class="size-4" weight="duotone" /></span>
    {/if}
    <h2 class="flex-1 text-sm font-extrabold tracking-tight">{title}</h2>
    {#if href}<a {href} class="text-xs font-semibold text-link hover:underline">{hrefLabel}</a>{/if}
  </header>
  <div class={flush ? 'pb-2' : 'px-4 pb-4'}>
    {@render children()}
  </div>
</section>
