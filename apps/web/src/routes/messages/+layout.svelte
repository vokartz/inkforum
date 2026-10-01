<script lang="ts">
  import type { ConversationListItem } from '@forum/shared';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { invalidate } from '$app/navigation';
  import NotePencilIcon from 'phosphor-svelte/lib/NotePencil';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import ChatsIcon from 'phosphor-svelte/lib/ChatsTeardrop';
  import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeft';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRight';
  import { Button } from '$lib/components/ui/button';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import { REALTIME_EVENT } from '$lib/realtime.svelte';
  import { formatClock } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data, children } = $props();
  let filter = $state('');
  let only = $state<'all' | 'unread'>('all');

  const inConversation = $derived(page.url.pathname !== '/messages');
  const activeId = $derived(Number(page.params.id ?? 0));
  const me = $derived(data.viewer.user?.id ?? 0);
  const title = (c: ConversationListItem) =>
    c.title || c.participants.map((p) => p.displayName).join(', ') || t('Konuşma');
  const unreadCount = $derived(data.inbox.items.filter((c) => c.unread).length);
  const items = $derived.by(() => {
    const q = filter.trim().toLocaleLowerCase('tr-TR');
    return data.inbox.items.filter(
      (c) =>
        (only === 'all' || c.unread) &&
        (!q ||
          `${title(c)} ${c.participants.map((p) => p.displayName).join(' ')} ${c.lastMessage?.excerpt ?? ''}`
            .toLocaleLowerCase('tr-TR')
            .includes(q)),
    );
  });
  const pages = $derived(Math.max(1, Math.ceil(data.inbox.total / data.inbox.perPage)));
  const empty = $derived(!inConversation && data.inbox.total === 0);

  // Yeni mesaj gelince ya da bir konuşma okununca liste yenilenir
  onMount(() => {
    const onEvent = (e: Event) => {
      const type = (e as CustomEvent<{ type: string }>).detail.type;
      if (type === 'message' || type === 'counters') void invalidate('app:messages');
    };
    window.addEventListener(REALTIME_EVENT, onEvent);
    return () => window.removeEventListener(REALTIME_EVENT, onEvent);
  });
</script>

<svelte:head><title>{t('Mesajlar')}</title></svelte:head>

{#if empty}
  <section class="grid justify-items-center gap-4 rounded-2xl border bg-card px-6 py-20 text-center shadow-card" data-part="messenger-empty">
    <ChatsIcon class="size-10 text-muted-foreground" weight="duotone" />
    <div class="grid gap-1">
      <h1 class="text-xl font-bold tracking-tight">{t('Henüz mesajın yok')}</h1>
      <p class="mx-auto max-w-sm text-sm text-muted-foreground">
        {t('Bir üyeye ya da birkaç üyeye birlikte yazabilirsin; mesajları yalnızca katılımcılar görür.')}
      </p>
    </div>
    <Button href="/messages/new"><NotePencilIcon />{t('Yeni mesaj')}</Button>
  </section>
{:else}
  <div
    class="grid h-[calc(100dvh-8.5rem)] min-h-[32rem] overflow-hidden rounded-2xl border bg-card shadow-card lg:grid-cols-[20rem_minmax(0,1fr)]"
    data-part="messenger"
  >
    <!-- Konuşma listesi -->
    <aside class={cn('flex min-h-0 flex-col border-r', inConversation && 'hidden lg:flex')} data-part="inbox">
      <div class="flex items-center gap-2 px-4 pt-4 pb-3">
        <h1 class="flex-1 text-lg font-bold tracking-tight">{t('Mesajlar')}</h1>
        <Button href="/messages/new" variant="ghost" size="icon-sm" aria-label={t('Yeni mesaj')} title={t('Yeni mesaj')}><NotePencilIcon /></Button>
      </div>
      <div class="grid gap-2 px-3 pb-2">
        <div class="relative">
          <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            bind:value={filter}
            placeholder={t('Ara')}
            class="h-8 w-full rounded-lg bg-muted/70 pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30"
            aria-label={t('Konuşmalarda ara')}
          />
        </div>
        <div class="flex gap-1 text-xs font-semibold" role="tablist">
          {#each [{ v: 'all', l: t('Tümü') }, { v: 'unread', l: unreadCount ? t('Okunmamış ({n})', { n: unreadCount }) : t('Okunmamış') }] as o (o.v)}
            <button
              type="button"
              role="tab"
              aria-selected={only === o.v}
              class={cn('rounded-md px-2 py-1 transition-colors', only === o.v ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
              onclick={() => (only = o.v as typeof only)}>{o.l}</button
            >
          {/each}
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {#each items as c (c.id)}
          {@const lead = c.lastMessage?.author ?? c.participants[0] ?? { displayName: '?', avatarUrl: null }}
          {@const mine = c.lastMessage?.author?.id === me}
          <a
            href="/messages/{c.id}"
            class={cn('flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors', activeId === c.id ? 'bg-accent' : 'hover:bg-accent/60')}
            aria-current={activeId === c.id ? 'page' : undefined}
            data-unread={c.unread || undefined}
          >
            <UserAvatar user={c.participants[0] ?? lead} size={40} class="shrink-0" />
            <span class="grid min-w-0 flex-1">
              <span class="flex items-baseline gap-2">
                <span class={cn('min-w-0 flex-1 truncate text-sm', c.unread ? 'font-bold' : 'font-medium')}>{title(c)}</span>
                {#if c.lastMessage}<span class="shrink-0 text-[11px] text-muted-foreground tabular-nums">{formatClock(c.lastMessage.at)}</span>{/if}
              </span>
              <span class="flex items-center gap-2">
                <span class={cn('min-w-0 flex-1 truncate text-[13px]', c.unread ? 'text-foreground' : 'text-muted-foreground')}
                  >{#if mine}{t('Sen:')} {/if}{c.lastMessage?.excerpt ?? ''}</span
                >
                {#if c.unread}<span class="size-2 shrink-0 rounded-full bg-primary" aria-label={t('Okunmamış')}></span>{/if}
              </span>
            </span>
          </a>
        {:else}
          <p class="px-4 py-10 text-center text-sm text-muted-foreground">
            {filter || only === 'unread' ? t('Eşleşen konuşma yok') : t('Henüz konuşman yok')}
          </p>
        {/each}
      </div>
      {#if pages > 1}
        <nav class="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <a href="?liste={data.inbox.page - 1}" class={cn('rounded p-1 hover:text-foreground', data.inbox.page <= 1 && 'pointer-events-none opacity-40')} aria-label={t('Daha yeni')}><CaretLeftIcon class="size-4" /></a>
          <span class="tabular-nums">{data.inbox.page} / {pages}</span>
          <a href="?liste={data.inbox.page + 1}" class={cn('rounded p-1 hover:text-foreground', data.inbox.page >= pages && 'pointer-events-none opacity-40')} aria-label={t('Daha eski')}><CaretRightIcon class="size-4" /></a>
        </nav>
      {/if}
    </aside>

    <!-- Konuşma / yeni mesaj -->
    <section class={cn('flex min-h-0 min-w-0 flex-col', !inConversation && 'hidden lg:flex')}>
      {@render children()}
    </section>
  </div>
{/if}
