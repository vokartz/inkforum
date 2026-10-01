<script lang="ts">
  import type { ConversationListItem } from '@forum/shared';
  import NotePencilIcon from 'phosphor-svelte/lib/NotePencil';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import EnvelopeIcon from 'phosphor-svelte/lib/EnvelopeSimple';
  import ChatsIcon from 'phosphor-svelte/lib/ChatCenteredText';
  import { Button } from '$lib/components/ui/button';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import { formatCompact } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  /** Özel mesajlar: forumdaki konu listesi gibi; her yazışma bir "konu" */
  let { data } = $props();
  let filter = $state('');
  let only = $state<'all' | 'unread'>('all');

  const me = $derived(data.viewer.user?.id ?? 0);
  const title = (c: ConversationListItem) => c.title || c.participants.map((p) => p.displayName).join(', ') || t('Konuşma');
  const unreadCount = $derived(data.inbox.items.filter((c) => c.unread).length);
  const items = $derived.by(() => {
    const q = filter.trim().toLocaleLowerCase('tr-TR');
    return data.inbox.items.filter(
      (c) =>
        (only === 'all' || c.unread) &&
        (!q || `${title(c)} ${c.participants.map((p) => p.displayName).join(' ')} ${c.lastMessage?.excerpt ?? ''}`.toLocaleLowerCase('tr-TR').includes(q)),
    );
  });
  const pages = $derived(Math.max(1, Math.ceil(data.inbox.total / data.inbox.perPage)));
</script>

<svelte:head><title>{t('Özel mesajlar')}</title></svelte:head>

<div class="grid gap-5" data-part="messages">
  <header class="flex flex-wrap items-end gap-4">
    <div class="min-w-0 flex-1">
      <h1 class="text-2xl font-bold tracking-tight">{t('Özel mesajlar')}</h1>
      <p class="mt-1 text-sm text-muted-foreground">{t('Bir ya da birkaç üyeyle, yalnızca katılımcıların görebildiği yazışmalar.')}</p>
    </div>
    <Button href="/messages/new"><NotePencilIcon />{t('Yeni mesaj')}</Button>
  </header>

  <section class="overflow-hidden rounded-xl border bg-card shadow-card" data-part="topic-list">
    <div class="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 sm:px-5">
      <div class="flex gap-4" role="tablist">
        {#each [{ v: 'all', l: t('Tümü'), n: data.inbox.total }, { v: 'unread', l: t('Okunmamış'), n: unreadCount }] as o (o.v)}
          <button
            type="button"
            role="tab"
            aria-selected={only === o.v}
            class={cn('text-sm font-semibold transition-colors', only === o.v ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
            onclick={() => (only = o.v as typeof only)}>{o.l} <span class="text-xs font-normal text-muted-foreground tabular-nums">{o.n}</span></button
          >
        {/each}
      </div>
      <div class="relative ml-auto w-full sm:w-64">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          bind:value={filter}
          placeholder={t('Konuşmalarda ara…')}
          class="h-8 w-full rounded-md border bg-background pr-3 pl-8 text-sm outline-none focus:border-ring"
          aria-label={t('Konuşmalarda ara')}
        />
      </div>
    </div>

    <!-- Sütun başlıkları (konu listesiyle aynı) -->
    <div class="hidden grid-cols-[minmax(0,1fr)_6rem_14rem] gap-4 border-b bg-panel-header px-5 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase md:grid">
      <span>{t('Konu')}</span><span class="text-center">{t('Yanıt')}</span><span>{t('Son mesaj')}</span>
    </div>

    {#each items as c (c.id)}
      {@const lead = c.participants[0] ?? null}
      <a
        href="/messages/{c.id}"
        class="grid items-center gap-x-4 gap-y-1 border-b px-4 py-3 transition-colors last:border-0 hover:bg-row-hover sm:px-5 md:grid-cols-[minmax(0,1fr)_6rem_14rem]"
        data-unread={c.unread || undefined}
        data-part="conversation-row"
      >
        <span class="flex min-w-0 items-center gap-3">
          <span class="relative shrink-0">
            {#if lead}<UserAvatar user={lead} size={38} />{:else}<span class="flex size-[38px] items-center justify-center rounded-full bg-muted"><EnvelopeIcon class="size-4 text-muted-foreground" /></span>{/if}
            {#if c.unread}<span class="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-primary" aria-label={t('Okunmamış')}></span>{/if}
          </span>
          <span class="min-w-0">
            <span class={cn('block truncate text-[15px]', c.unread ? 'font-bold' : 'font-semibold')}>{title(c)}</span>
            <span class="block truncate text-xs text-muted-foreground">
              {c.participantCount > 2 ? t('{n} katılımcı', { n: c.participantCount }) : t('Sen ve {name}', { name: lead?.displayName ?? '?' })}
            </span>
          </span>
        </span>
        <span class="hidden text-center md:block">
          <span class="block text-sm font-semibold tabular-nums">{formatCompact(Math.max(0, c.messageCount - 1))}</span>
          <span class="text-[11px] text-muted-foreground">{t('yanıt')}</span>
        </span>
        <span class="flex min-w-0 items-center gap-2.5 pl-[50px] md:pl-0">
          {#if c.lastMessage}
            <UserAvatar user={c.lastMessage.author ?? { displayName: c.lastMessage.authorName, avatarUrl: null }} size={28} class="hidden md:inline-flex" />
            <span class="min-w-0 text-xs leading-tight">
              <span class="block truncate text-muted-foreground">
                {#if c.lastMessage.author?.id === me}{t('Sen')}{:else if c.lastMessage.author}<UserName user={c.lastMessage.author} class="text-xs" />{:else}{c.lastMessage.authorName}{/if}
                · <TimeAgo ms={c.lastMessage.at} />
              </span>
              <span class="block truncate text-muted-foreground/80">{c.lastMessage.excerpt}</span>
            </span>
          {/if}
        </span>
      </a>
    {:else}
      <div class="grid justify-items-center gap-3 px-6 py-16 text-center">
        <ChatsIcon class="size-9 text-muted-foreground/70" weight="duotone" />
        <p class="text-sm text-muted-foreground">
          {filter || only === 'unread' ? t('Eşleşen konuşma yok') : t('Henüz bir konuşman yok. Bir üyeye konu açar gibi mesaj gönderebilirsin.')}
        </p>
        {#if !filter && only === 'all'}<Button href="/messages/new" variant="outline" size="sm"><NotePencilIcon />{t('Yeni mesaj')}</Button>{/if}
      </div>
    {/each}
  </section>

  {#if pages > 1}<Pagination page={data.inbox.page} perPage={data.inbox.perPage} total={data.inbox.total} param="liste" />{/if}
</div>
