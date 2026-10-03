<script lang="ts">
  import type { HomeBlock } from '@forum/shared';
  import ArrowUpRightIcon from 'phosphor-svelte/lib/ArrowUpRight';
  import { cn } from '$lib/utils';

  let { block, compact = false }: { block: Extract<HomeBlock, { kind: 'tiles' }>; compact?: boolean } = $props();

  const COLS: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
  };
  const HEIGHT = { sm: 'h-32', md: 'h-44', lg: 'h-60' } as const;
  const cols = $derived(compact ? 'grid-cols-1' : (COLS[block.columns] ?? COLS[3]));
</script>

<section data-part="tiles" class="grid gap-3">
  {#if block.title}<h2 class="text-lg font-extrabold tracking-tight">{block.title}</h2>{/if}
  <div class={cn('grid gap-3 sm:gap-4', cols)}>
    {#each block.items as t, i (i)}
      {@const external = !!t.url && /^https?:/i.test(t.url)}
      <svelte:element
        this={t.url ? 'a' : 'div'}
        href={t.url ?? undefined}
        target={t.url && t.newTab ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        style="--i:{i}"
        class={cn(
          'group/tile relative isolate flex flex-col justify-end overflow-hidden rounded-2xl border bg-muted p-4 text-white shadow-card animate-rise',
          HEIGHT[block.height] ?? HEIGHT.md,
          t.url && 'lift',
        )}
        data-part="tile"
      >
        {#if t.image}
          <img src={t.image} alt="" loading="lazy" class="absolute inset-0 -z-10 size-full object-cover transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover/tile:scale-110" />
        {:else}
          <div class="absolute inset-0 -z-10 bg-[linear-gradient(140deg,color-mix(in_oklch,var(--primary)_80%,white),var(--primary)_45%,color-mix(in_oklch,var(--primary)_40%,black))]"></div>
        {/if}
        <div class="absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent_30%,rgb(0_0_0/0.78)_100%)]"></div>
        {#if t.url}
          <span class="absolute top-3 right-3 flex size-8 translate-y-1 items-center justify-center rounded-full bg-white/15 opacity-0 backdrop-blur transition-all duration-300 group-hover/tile:translate-y-0 group-hover/tile:opacity-100">
            <ArrowUpRightIcon class="size-4" weight="bold" />
          </span>
        {/if}
        {#if t.title}<p class="text-base leading-tight font-extrabold drop-shadow">{t.title}</p>{/if}
        {#if t.subtitle}<p class="mt-0.5 line-clamp-2 text-xs text-white/80">{t.subtitle}</p>{/if}
      </svelte:element>
    {/each}
  </div>
</section>
