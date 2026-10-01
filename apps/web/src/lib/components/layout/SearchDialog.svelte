<script lang="ts">
  import type { SearchResults } from '@forum/shared';
  import { goto } from '$app/navigation';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import ChatTextIcon from 'phosphor-svelte/lib/ChatText';
  import ClockIcon from 'phosphor-svelte/lib/ClockCounterClockwise';
  import SlidersIcon from 'phosphor-svelte/lib/SlidersHorizontal';
  import ArrowIcon from 'phosphor-svelte/lib/ArrowBendDownLeft';
  import XIcon from 'phosphor-svelte/lib/X';
  import * as Dialog from '$lib/components/ui/dialog';
  import { api } from '$lib/api';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';
  import UserAvatar from '../UserAvatar.svelte';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const RECENT_KEY = 'forum:recent-searches';
  let q = $state('');
  let loading = $state(false);
  let results = $state<SearchResults | null>(null);
  let active = $state(0);
  let recent = $state<string[]>([]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  function loadRecent() {
    try {
      recent = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]').slice(0, 6);
    } catch {
      recent = [];
    }
  }
  function remember(term: string) {
    recent = [term, ...recent.filter((r) => r !== term)].slice(0, 6);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      /* depolama kapalı olabilir */
    }
  }
  function forget(term: string) {
    recent = recent.filter((r) => r !== term);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      /* yok say */
    }
  }

  type Row = { href: string; key: string };
  const rows = $derived<Row[]>(
    q.trim().length >= 2 && results
      ? [
          ...results.topics.slice(0, 6).map((t) => ({ href: `/t/${t.id}/${t.slug}`, key: `t${t.id}` })),
          ...results.members.slice(0, 4).map((m) => ({ href: `/u/${m.id}/${m.slug}`, key: `m${m.id}` })),
        ]
      : recent.map((r) => ({ href: `/search?q=${encodeURIComponent(r)}`, key: `r${r}` })),
  );

  function onInput() {
    clearTimeout(timer);
    active = 0;
    const term = q.trim();
    if (term.length < 2) {
      results = null;
      loading = false;
      return;
    }
    loading = true;
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const r = await api.get<SearchResults>(`/api/search?q=${encodeURIComponent(term)}`);
        if (mine === seq) results = r;
      } catch {
        if (mine === seq) results = null;
      } finally {
        if (mine === seq) loading = false;
      }
    }, 200);
  }

  function go(href: string) {
    const term = q.trim();
    if (term.length >= 2) remember(term);
    open = false;
    void goto(href);
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const row = rows[active];
    if (row && (q.trim().length < 2 || results)) return go(row.href);
    if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  function onKey(e: KeyboardEvent) {
    if (!rows.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = (active + 1) % rows.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active - 1 + rows.length) % rows.length;
    }
  }

  // Kısayollar: Ctrl/⌘+K ve "/" (yazı alanında değilken)
  function onGlobalKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      open = !open;
    } else if (e.key === '/' && !typing && !open) {
      e.preventDefault();
      open = true;
    }
  }

  $effect(() => {
    if (open) {
      loadRecent();
      active = 0;
    }
  });
</script>

<svelte:window onkeydown={onGlobalKey} />

<Dialog.Root bind:open>
  <Dialog.Content showCloseButton={false} class="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" data-part="search-dialog">
    <Dialog.Title class="sr-only">{t('Forumda ara')}</Dialog.Title>
    <form role="search" onsubmit={submit} class="flex items-center gap-3 border-b px-4">
      <SearchIcon class="size-5 shrink-0 text-muted-foreground" />
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={q}
        oninput={onInput}
        onkeydown={onKey}
        autofocus
        placeholder={t('Konu, mesaj veya üye ara…')}
        aria-label={t('Arama')}
        autocomplete="off"
        class="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
      />
      {#if loading}<LoaderIcon class="size-4 shrink-0 animate-spin text-muted-foreground" />{/if}
      <kbd class="hidden rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted-foreground sm:block">ESC</kbd>
    </form>

    <div class="max-h-[55vh] overflow-y-auto p-2">
      {#if q.trim().length < 2}
        {#if recent.length}
          <p class="px-2 pt-1 pb-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{t('Son aramalar')}</p>
          {#each recent as r, i (r)}
            <div class={cn('group flex items-center rounded-lg', active === i && 'bg-accent')}>
              <button type="button" class="flex flex-1 items-center gap-3 px-2.5 py-2 text-left text-sm" onclick={() => go(`/search?q=${encodeURIComponent(r)}`)} onmouseenter={() => (active = i)}>
                <ClockIcon class="size-4 text-muted-foreground" />{r}
              </button>
              <button type="button" class="mr-1 rounded-md p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted" aria-label={t('Kaldır')} onclick={() => forget(r)}>
                <XIcon class="size-3.5" />
              </button>
            </div>
          {/each}
        {:else}
          <div class="grid justify-items-center gap-2 px-4 py-10 text-center">
            <span class="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><SearchIcon class="size-6" weight="duotone" /></span>
            <p class="text-sm font-semibold">{t('Ne arıyorsun?')}</p>
            <p class="text-xs text-muted-foreground">{t('En az 2 harf yaz. Sonuçlar yazdıkça gelir.')}</p>
          </div>
        {/if}
      {:else if results}
        {#if results.topics.length}
          <p class="px-2 pt-1 pb-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{t('Konular')}</p>
          {#each results.topics.slice(0, 6) as topic, i (topic.id)}
            <button type="button" onclick={() => go(`/t/${topic.id}/${topic.slug}`)} onmouseenter={() => (active = i)} class={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm', active === i && 'bg-accent')}>
              <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ChatTextIcon class="size-4" /></span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold">{topic.title}</span>
                <span class="block truncate text-xs text-muted-foreground">{tc(topic.board.name)} · {t('{n} yanıt', { n: topic.replyCount })}</span>
              </span>
              {#if active === i}<ArrowIcon class="size-4 text-muted-foreground" />{/if}
            </button>
          {/each}
        {/if}
        {#if results.members.length}
          <p class="px-2 pt-3 pb-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{t('Üyeler')}</p>
          {#each results.members.slice(0, 4) as m, i (m.id)}
            {@const idx = Math.min(results.topics.length, 6) + i}
            <button type="button" onclick={() => go(`/u/${m.id}/${m.slug}`)} onmouseenter={() => (active = idx)} class={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm', active === idx && 'bg-accent')}>
              <UserAvatar user={m} size={28} />
              <span class="flex-1 font-semibold" style={m.color ? `color:${m.color}` : undefined}>{m.displayName}</span>
              {#if active === idx}<ArrowIcon class="size-4 text-muted-foreground" />{/if}
            </button>
          {/each}
        {/if}
        {#if !results.topics.length && !results.members.length}
          <p class="px-3 py-10 text-center text-sm text-muted-foreground">{t('“{q}” için hızlı sonuç yok. Enter ile tam aramayı dene.', { q: q.trim() })}</p>
        {/if}
      {/if}
    </div>

    <div class="flex items-center justify-between gap-2 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
      <span class="hidden items-center gap-3 sm:flex">
        <span><kbd class="rounded border bg-card px-1 font-sans">↑</kbd> <kbd class="rounded border bg-card px-1 font-sans">↓</kbd> {t('gezin')}</span>
        <span><kbd class="rounded border bg-card px-1 font-sans">Enter</kbd> {t('aç')}</span>
      </span>
      <button type="button" class="inline-flex items-center gap-1.5 font-semibold text-link hover:underline" onclick={() => go(`/search${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)}>
        <SlidersIcon class="size-3.5" />{t('Gelişmiş arama')}
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>
