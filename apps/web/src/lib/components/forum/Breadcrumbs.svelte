<script lang="ts">
  import type { Breadcrumb } from '@forum/shared';
  import ChevronRightIcon from 'phosphor-svelte/lib/CaretRight';
  import HouseIcon from 'phosphor-svelte/lib/House';
  import { t } from '$lib/i18n.svelte';

  let { items, current }: { items: Breadcrumb[]; current?: string } = $props();
</script>

<nav aria-label={t('Konum')} data-part="breadcrumbs" class="mb-4 min-w-0">
  <ol class="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
    {#each items as b, i (b.href + i)}
      <li class="flex min-w-0 items-center gap-1">
        {#if i > 0}<ChevronRightIcon class="size-3.5 shrink-0 opacity-60" />{/if}
        <a href={b.href} class="flex min-w-0 items-center gap-1 truncate rounded px-1 transition-colors hover:text-foreground">
          {#if i === 0}<HouseIcon class="size-3.5 shrink-0" />{/if}<span class="truncate">{b.label}</span>
        </a>
      </li>
    {/each}
    {#if current}
      <li class="flex min-w-0 items-center gap-1">
        <ChevronRightIcon class="size-3.5 shrink-0 opacity-60" />
        <span class="truncate px-1 text-foreground" aria-current="page">{current}</span>
      </li>
    {/if}
  </ol>
</nav>
