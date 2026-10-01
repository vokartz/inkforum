<script lang="ts">
  import { goto } from '$app/navigation';
  import { fly } from 'svelte/transition';
  import type { SearchResults } from '@forum/shared';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import MessageSquareTextIcon from 'phosphor-svelte/lib/ChatText';
  import { api } from '$lib/api';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import UserAvatar from '../UserAvatar.svelte';

  let { class: className }: { class?: string } = $props();

  let q = $state('');
  let open = $state(false);
  let loading = $state(false);
  let results = $state<SearchResults | null>(null);
  let active = $state(-1);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  const flat = $derived(
    results
      ? [
          ...results.topics.slice(0, 6).map((t) => ({ href: `/t/${t.id}/${t.slug}`, key: `t${t.id}` })),
          ...results.members.slice(0, 4).map((m) => ({ href: `/u/${m.id}/${m.slug}`, key: `m${m.id}` })),
        ]
      : [],
  );

  function onInput() {
    clearTimeout(timer);
    active = -1;
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
        if (mine === seq) {
          results = r;
          open = true;
        }
      } catch {
        if (mine === seq) results = null;
      } finally {
        if (mine === seq) loading = false;
      }
    }, 250);
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const target = active >= 0 ? flat[active]?.href : null;
    open = false;
    if (target) void goto(target);
    else if (q.trim()) void goto(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  function onKey(e: KeyboardEvent) {
    if (!flat.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = (active + 1) % flat.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active - 1 + flat.length) % flat.length;
    } else if (e.key === 'Escape') {
      open = false;
    }
  }
</script>

<form class={cn('relative', className)} role="search" onsubmit={submit} data-part="header-search">
  <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
  <input
    bind:value={q}
    oninput={onInput}
    onkeydown={onKey}
    onfocus={() => results && (open = true)}
    onblur={() => setTimeout(() => (open = false), 150)}
    placeholder={t('Ara…')}
    aria-label={t('Forumda ara')}
    autocomplete="off"
    class="h-9 w-full rounded-full border border-transparent bg-[color-mix(in_oklch,var(--muted)_80%,transparent)] pr-9 pl-9 text-sm transition-all outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:ring-3 focus:ring-ring/25"
  />
  {#if loading}<LoaderIcon class="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />{/if}

  {#if open && results && q.trim().length >= 2}
    <div
      transition:fly={{ y: -4, duration: 150 }}
      class="absolute top-full right-0 z-50 mt-2 w-[min(26rem,90vw)] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
    >
      {#if results.topics.length}
        <p class="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t('Konular')}</p>
        {#each results.topics.slice(0, 6) as topic, i (topic.id)}
          <a href="/t/{topic.id}/{topic.slug}" class={cn('flex items-start gap-2.5 px-3 py-2 text-sm hover:bg-accent', active === i && 'bg-accent')}>
            <MessageSquareTextIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span class="min-w-0">
              <span class="block truncate font-medium">{topic.title}</span>
              <span class="block truncate text-xs text-muted-foreground">{topic.board.name} · {t('{n} yanıt', { n: topic.replyCount })}</span>
            </span>
          </a>
        {/each}
      {/if}
      {#if results.members.length}
        <p class="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t('Üyeler')}</p>
        {#each results.members.slice(0, 4) as m, i (m.id)}
          {@const idx = Math.min(results.topics.length, 6) + i}
          <a href="/u/{m.id}/{m.slug}" class={cn('flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent', active === idx && 'bg-accent')}>
            <UserAvatar user={m} size={22} />
            <span class="font-medium" style={m.color ? `color:${m.color}` : undefined}>{m.displayName}</span>
          </a>
        {/each}
      {/if}
      {#if !results.topics.length && !results.members.length}
        <p class="px-3 py-5 text-center text-sm text-muted-foreground">{t('Sonuç bulunamadı.')}</p>
      {/if}
      <a href="/search?q={encodeURIComponent(q.trim())}" class="block border-t px-3 py-2 text-center text-xs font-medium text-link hover:bg-accent">
        {t('Tüm sonuçları göster')}
      </a>
    </div>
  {/if}
</form>
