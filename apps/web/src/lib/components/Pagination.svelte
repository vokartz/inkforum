<script lang="ts">
  import { page as pageState } from '$app/state';
  import ChevronLeftIcon from 'phosphor-svelte/lib/CaretLeft';
  import ChevronRightIcon from 'phosphor-svelte/lib/CaretRight';
  import { buttonVariants } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    page: number;
    perPage: number;
    total: number;
    param?: string;
  }
  let { page, perPage, total, param = 'page' }: Props = $props();

  const pages = $derived(Math.max(1, Math.ceil(total / perPage)));

  function href(p: number): string {
    const url = new URL(pageState.url);
    if (p <= 1) url.searchParams.delete(param);
    else url.searchParams.set(param, String(p));
    return url.pathname + url.search;
  }

  const items = $derived.by(() => {
    const out: Array<number | '…'> = [];
    for (let p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - page) <= 1) out.push(p);
      else if (out[out.length - 1] !== '…') out.push('…');
    }
    return out;
  });
</script>

{#if pages > 1}
  <nav class="mt-6 flex items-center justify-center gap-1" aria-label={t('Sayfalar')}>
    <a
      href={page > 1 ? href(page - 1) : undefined}
      aria-disabled={page <= 1}
      class={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), page <= 1 && 'pointer-events-none opacity-40')}
      aria-label={t('Önceki sayfa')}
    >
      <ChevronLeftIcon />
    </a>
    {#each items as item, i (i)}
      {#if item === '…'}
        <span class="px-1 text-muted-foreground">…</span>
      {:else}
        <a
          href={href(item)}
          aria-current={item === page ? 'page' : undefined}
          class={cn(buttonVariants({ variant: item === page ? 'default' : 'ghost', size: 'icon-sm' }))}>{item}</a
        >
      {/if}
    {/each}
    <a
      href={page < pages ? href(page + 1) : undefined}
      aria-disabled={page >= pages}
      class={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), page >= pages && 'pointer-events-none opacity-40')}
      aria-label={t('Sonraki sayfa')}
    >
      <ChevronRightIcon />
    </a>
  </nav>
{/if}
