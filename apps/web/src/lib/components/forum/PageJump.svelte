<script lang="ts">
  import { goto } from '$app/navigation';
  import { page as pageState } from '$app/state';
  import ChevronLeftIcon from 'phosphor-svelte/lib/CaretLeft';
  import ChevronRightIcon from 'phosphor-svelte/lib/CaretRight';
  import ChevronsRightIcon from 'phosphor-svelte/lib/CaretDoubleRight';
  import ChevronDownIcon from 'phosphor-svelte/lib/CaretDown';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    page: number;
    perPage: number;
    total: number;
    class?: string;
  }
  let { page, perPage, total, class: className }: Props = $props();

  const pages = $derived(Math.max(1, Math.ceil(total / perPage)));
  let jump = $state('');
  let open = $state(false);

  function href(p: number): string {
    const url = new URL(pageState.url);
    url.hash = '';
    if (p <= 1) url.searchParams.delete('page');
    else url.searchParams.set('page', String(p));
    return url.pathname + url.search;
  }

  const items = $derived.by(() => {
    const out: Array<number | '…'> = [];
    for (let p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - page) <= 2) out.push(p);
      else if (out[out.length - 1] !== '…') out.push('…');
    }
    return out;
  });

  function go(e: SubmitEvent) {
    e.preventDefault();
    const n = Math.min(pages, Math.max(1, Number(jump) || 1));
    open = false;
    jump = '';
    void goto(href(n));
  }

  const btn = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors';
</script>

{#if pages > 1}
  <nav data-part="page-jump" class={cn('flex flex-wrap items-center gap-1', className)} aria-label={t('Sayfalar')}>
    <a
      href={page > 1 ? href(page - 1) : undefined}
      aria-disabled={page <= 1}
      class={cn(btn, 'text-muted-foreground hover:bg-accent hover:text-foreground', page <= 1 && 'pointer-events-none opacity-40')}
      aria-label={t('Önceki sayfa')}><ChevronLeftIcon class="size-4" /></a
    >
    {#each items as item, i (i)}
      {#if item === '…'}
        <span class="px-1 text-muted-foreground">…</span>
      {:else}
        <a
          href={href(item)}
          aria-current={item === page ? 'page' : undefined}
          class={cn(btn, item === page ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-accent')}>{item}</a
        >
      {/if}
    {/each}
    <a
      href={page < pages ? href(page + 1) : undefined}
      aria-disabled={page >= pages}
      class={cn(btn, 'gap-1 text-muted-foreground hover:bg-accent hover:text-foreground', page >= pages && 'pointer-events-none opacity-40')}
      aria-label={t('Sonraki sayfa')}>{t('Sonraki')}<ChevronRightIcon class="size-4" /></a
    >
    {#if page < pages - 1}
      <a href={href(pages)} class={cn(btn, 'text-muted-foreground hover:bg-accent hover:text-foreground')} aria-label={t('Son sayfa')}><ChevronsRightIcon class="size-4" /></a>
    {/if}
    <Popover.Root bind:open>
      <Popover.Trigger class={cn(btn, 'gap-1 text-muted-foreground hover:bg-accent hover:text-foreground')}>
        {t('Sayfa {page} / {pages}', { page, pages })}<ChevronDownIcon class="size-3.5" />
      </Popover.Trigger>
      <Popover.Content class="w-56" align="end">
        <form class="flex gap-2" onsubmit={go}>
          <Input type="number" min={1} max={pages} bind:value={jump} placeholder={t('Sayfa no')} aria-label={t('Sayfa numarası')} />
          <Button type="submit" size="sm">{t('Git')}</Button>
        </form>
      </Popover.Content>
    </Popover.Root>
  </nav>
{/if}
