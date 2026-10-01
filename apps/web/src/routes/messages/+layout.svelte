<script lang="ts">
  import type { ConversationListItem } from '@forum/shared';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { invalidate } from '$app/navigation';
  import NotePencilIcon from 'phosphor-svelte/lib/NotePencil';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import ChatsIcon from 'phosphor-svelte/lib/ChatsTeardrop';
  import TrayIcon from 'phosphor-svelte/lib/Tray';
  import { Button } from '$lib/components/ui/button';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { REALTIME_EVENT } from '$lib/realtime.svelte';
  import { formatCompact } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data, children } = $props();
  let filter = $state('');
  let only = $state<'all' | 'unread'>('all');

  const inConversation = $derived(page.url.pathname !== '/messages');
  const activeId = $derived(Number(page.params.id ?? 0));
  const title = (c: ConversationListItem) =>
    c.title || c.participants.map((p) => p.displayName).join(', ') || t('Konuşma');
  /** "Ali, Ayşe ve sen" */
  const people = (c: ConversationListItem) => {
    const names = c.participants.slice(0, 3).map((p) => p.displayName);
    const more = c.participantCount - 1 - names.length;
    return more > 0
      ? t('{names}, +{n} kişi ve sen', { names: names.join(', '), n: more })
      : names.length
        ? t('{names} ve sen', { names: names.join(', ') })
        : t('Yalnızca sen');
  };
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
  <section class="rounded-2xl border bg-card shadow-card" data-part="messenger-empty">
    <div class="grid justify-items-center gap-4 px-6 py-16 text-center sm:py-20">
      <span class="flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary"
        ><ChatsIcon class="size-8" weight="duotone" /></span
      >
      <div class="grid gap-1.5">
        <h1 class="text-2xl font-extrabold tracking-tight">{t('Özel mesajlar')}</h1>
        <p class="mx-auto max-w-md text-sm text-muted-foreground">
          {t(
            'Henüz bir konuşman yok. Bir üyeye ya da birkaç üyeye birlikte yazabilirsin; mesajları yalnızca katılımcılar görür.',
          )}
        </p>
      </div>
      <Button href="/messages/new" size="lg"><NotePencilIcon />{t('Yeni mesaj yaz')}</Button>
    </div>
  </section>
{:else}
  <div class="grid gap-4" data-part="messenger">
    <!-- Üst şerit: başlık, yeni mesaj, arama ve süzgeç -->
    <header
      class={cn(
        'flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 shadow-card sm:px-5',
        inConversation && 'hidden lg:flex',
      )}
    >
      <h1 class="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <TrayIcon class="size-6 text-primary" weight="duotone" />{t('Gelen kutusu')}
      </h1>
      <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground tabular-nums"
        >{formatCompact(data.inbox.total)}</span
      >
      <Button href="/messages/new" class="ml-1"><NotePencilIcon />{t('Yeni mesaj yaz')}</Button>
      <span class="flex-1"></span>
      <div class="flex rounded-lg bg-muted p-0.5 text-sm" role="tablist">
        {#each [{ v: 'all', l: t('Tümü') }, { v: 'unread', l: unreadCount ? t( 'Okunmamış ({n})', { n: unreadCount } ) : t('Okunmamış') }] as o (o.v)}
          <button
            type="button"
            role="tab"
            aria-selected={only === o.v}
            class={cn(
              'rounded-md px-3 py-1.5 font-semibold transition-colors',
              only === o.v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            onclick={() => (only = o.v as typeof only)}>{o.l}</button
          >
        {/each}
      </div>
      <div class="relative w-full sm:w-64">
        <SearchIcon
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          bind:value={filter}
          placeholder={t('Konuşmalarda ara…')}
          class="h-9 w-full rounded-lg border bg-background pr-3 pl-9 text-sm outline-none focus:border-ring"
          aria-label={t('Konuşmalarda ara')}
        />
      </div>
    </header>

    <div class="grid items-start gap-4 lg:grid-cols-[23rem_minmax(0,1fr)]">
      <!-- Konuşma listesi -->
      <aside
        class={cn(
          'overflow-hidden rounded-2xl border bg-card shadow-card lg:sticky lg:top-20',
          inConversation && 'hidden lg:block',
        )}
        data-part="inbox"
      >
        <div class="max-h-[calc(100dvh-7rem)] divide-y overflow-y-auto">
          {#each items as c (c.id)}
            {@const lead = c.lastMessage?.author ??
              c.participants[0] ?? { displayName: '?', avatarUrl: null }}
            <a
              href="/messages/{c.id}"
              class={cn(
                'relative flex gap-3 px-4 py-3.5 transition-colors',
                activeId === c.id ? 'bg-primary-soft' : 'hover:bg-row-hover',
              )}
              aria-current={activeId === c.id ? 'page' : undefined}
              data-unread={c.unread || undefined}
            >
              {#if c.unread}<span class="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true"
                ></span>{/if}
              <UserAvatar user={lead} size={44} class="shrink-0" />
              <span class="grid min-w-0 flex-1 gap-0.5">
                <span class={cn('truncate text-[15px]', c.unread ? 'font-bold' : 'font-semibold')}
                  >{title(c)}</span
                >
                {#if c.lastMessage}
                  <span
                    class={cn('line-clamp-1 text-sm', c.unread ? 'text-foreground' : 'text-muted-foreground')}
                    >{c.lastMessage.excerpt}</span
                  >
                {/if}
                <span class="truncate text-xs text-muted-foreground">{people(c)}</span>
              </span>
              <span class="flex shrink-0 flex-col items-end justify-between gap-2">
                <span
                  class={cn(
                    'flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums',
                    c.unread ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                  title={t('{n} mesaj', { n: c.messageCount })}
                >
                  {formatCompact(c.messageCount)}
                </span>
                {#if c.lastMessage}<TimeAgo
                    ms={c.lastMessage.at}
                    class="text-xs text-muted-foreground"
                  />{/if}
              </span>
            </a>
          {:else}
            <div class="grid justify-items-center gap-2 px-4 py-12 text-center">
              <span class="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                ><ChatsIcon class="size-6" weight="duotone" /></span
              >
              <p class="text-sm font-semibold">
                {filter || only === 'unread' ? t('Eşleşen konuşma yok') : t('Henüz konuşman yok')}
              </p>
            </div>
          {/each}
        </div>
        {#if pages > 1}
          <nav class="flex items-center justify-between border-t px-4 py-2.5 text-xs">
            {#if data.inbox.page > 1}<a
                href="?liste={data.inbox.page - 1}"
                class="font-semibold text-link hover:underline">← {t('Daha yeni')}</a
              >{:else}<span></span>{/if}
            <span class="text-muted-foreground">{data.inbox.page} / {pages}</span>
            {#if data.inbox.page < pages}<a
                href="?liste={data.inbox.page + 1}"
                class="font-semibold text-link hover:underline">{t('Daha eski')} →</a
              >{:else}<span></span>{/if}
          </nav>
        {/if}
      </aside>

      <!-- Konuşma / yeni mesaj -->
      <section class={cn('min-w-0', !inConversation && 'hidden lg:block')}>
        {@render children()}
      </section>
    </div>
  </div>
{/if}
