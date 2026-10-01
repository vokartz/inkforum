<script lang="ts">
  import { goto } from '$app/navigation';
  import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import { api } from '$lib/api';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import type { IconNode } from '@forum/shared';

  let { class: className, large = false }: { class?: string; large?: boolean } = $props();
  let q = $state('');
  let items = $state<Array<{ title: string; path: string; iconNodes: IconNode | null; summary: string | null }>>([]);
  let loading = $state(false);
  let open = $state(false);
  let active = $state(0);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function onInput() {
    clearTimeout(timer);
    const term = q.trim();
    if (term.length < 2) {
      items = [];
      return;
    }
    timer = setTimeout(async () => {
      loading = true;
      try {
        items = (await api.get<{ items: typeof items }>(`/api/wiki/search?q=${encodeURIComponent(term)}`)).items;
        active = 0;
        open = true;
      } catch {
        items = [];
      } finally {
        loading = false;
      }
    }, 200);
  }
  function onkeydown(e: KeyboardEvent) {
    if (!items.length) return;
    if (e.key === 'Escape') open = false;
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'ArrowDown') active = (active + 1) % items.length;
    else if (e.key === 'ArrowUp') active = (active - 1 + items.length) % items.length;
    else {
      open = false;
      void goto(`/wiki/${items[active]!.path}`);
    }
  }
</script>

<div class={cn('relative', className)} data-part="wiki-search">
  <MagnifyingGlassIcon class={cn('pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground', large ? 'size-5' : 'size-4')} />
  <input
    bind:value={q}
    oninput={onInput}
    {onkeydown}
    onfocus={() => (open = items.length > 0)}
    onblur={() => setTimeout(() => (open = false), 150)}
    placeholder={t('Wikide ara…')}
    class={cn('w-full rounded-lg border bg-background pr-9 text-foreground outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/20', large ? 'h-12 pl-10 text-base shadow-sm' : 'h-9 pl-9 text-sm')}
    aria-label={t('Wikide ara')}
    role="combobox"
    aria-expanded={open}
    aria-controls="wiki-search-results"
  />
  {#if loading}<LoaderIcon class="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />{/if}
  {#if open && q.trim().length >= 2}
    <div id="wiki-search-results" class="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border bg-popover text-left shadow-lg animate-in fade-in slide-in-from-top-1" role="listbox">
      {#each items as it, i (it.path)}
        <a href="/wiki/{it.path}" class={cn('grid gap-0.5 px-3 py-2.5 text-sm', i === active ? 'bg-accent' : 'hover:bg-accent')} role="option" aria-selected={i === active}>
          <span class="flex items-center gap-1.5 font-semibold">{#if it.iconNodes}<NodeIcon nodes={it.iconNodes} size={15} class="text-primary" />{/if}{it.title}</span>
          <span class="truncate text-xs text-muted-foreground">/wiki/{it.path}{it.summary ? ` — ${it.summary}` : ''}</span>
        </a>
      {:else}
        <p class="px-3 py-3 text-sm text-muted-foreground">{t('Sonuç bulunamadı.')}</p>
      {/each}
    </div>
  {/if}
</div>
