<script lang="ts">
  import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeft';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRight';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { images, autoplay, onopen }: { images: Array<{ url: string; caption: string }>; autoplay: boolean; onopen: (url: string) => void } = $props();
  let track: HTMLDivElement;
  let index = $state(0);
  let paused = $state(false);

  function go(i: number) {
    const n = images.length;
    index = ((i % n) + n) % n;
    const slide = track?.children[index] as HTMLElement | undefined;
    if (slide) track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: 'smooth' });
  }
  function onScroll() {
    const w = track.clientWidth;
    if (w) index = Math.round(track.scrollLeft / w);
  }
  $effect(() => {
    if (!autoplay || images.length < 2 || paused) return;
    const t = setInterval(() => go(index + 1), 4500);
    return () => clearInterval(t);
  });
</script>

<div class="group relative" role="region" aria-label={t('Galeri')} onmouseenter={() => (paused = true)} onmouseleave={() => (paused = false)}>
  <div bind:this={track} onscroll={onScroll} class="flex snap-x snap-mandatory overflow-x-auto rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {#each images as g, i (i)}
      <button type="button" class="relative aspect-[16/8] w-full shrink-0 snap-center overflow-hidden bg-muted" onclick={() => onopen(g.url)}>
        <img src={g.url} alt={g.caption} class="size-full object-cover" loading={i ? 'lazy' : 'eager'} />
        {#if g.caption}<span class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-5 pt-10 pb-4 text-left text-sm font-semibold text-white sm:text-base">{g.caption}</span>{/if}
      </button>
    {/each}
  </div>
  {#if images.length > 1}
    <button type="button" class="absolute top-1/2 left-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:bg-black/65" onclick={() => go(index - 1)} aria-label={t('Önceki')}><CaretLeftIcon class="size-5" weight="bold" /></button>
    <button type="button" class="absolute top-1/2 right-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:bg-black/65" onclick={() => go(index + 1)} aria-label={t('Sonraki')}><CaretRightIcon class="size-5" weight="bold" /></button>
    <div class="mt-3 flex justify-center gap-1.5">
      {#each images as _, i (i)}
        <button type="button" class={cn('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground')} onclick={() => go(i)} aria-label={t('{n}. görsel', { n: i + 1 })}></button>
      {/each}
    </div>
  {/if}
</div>
