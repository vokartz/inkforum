<script lang="ts">
  import type { ConversationListItem } from '@forum/shared';
  import { page } from '$app/state';
  import NotePencilIcon from 'phosphor-svelte/lib/NotePencil';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import UsersThreeIcon from 'phosphor-svelte/lib/UsersThree';
  import ChatsIcon from 'phosphor-svelte/lib/ChatsTeardrop';
  import { Button } from '$lib/components/ui/button';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data, children } = $props();
  let filter = $state('');

  const inConversation = $derived(page.url.pathname !== '/messages');
  const activeId = $derived(Number(page.params.id ?? 0));
  const title = (c: ConversationListItem) => c.title || c.participants.map((p) => p.displayName).join(', ') || t('Konuşma');
  const items = $derived.by(() => {
    const q = filter.trim().toLocaleLowerCase('tr-TR');
    if (!q) return data.inbox.items;
    return data.inbox.items.filter((c) => `${title(c)} ${c.participants.map((p) => p.displayName).join(' ')}`.toLocaleLowerCase('tr-TR').includes(q));
  });
  const pages = $derived(Math.max(1, Math.ceil(data.inbox.total / data.inbox.perPage)));
</script>

<svelte:head><title>{t('Mesajlar')}</title></svelte:head>

<div class="grid h-[calc(100dvh-11rem)] min-h-[32rem] overflow-hidden rounded-xl border bg-card lg:grid-cols-[22rem_minmax(0,1fr)]" data-part="messenger">
  <!-- Konuşma listesi -->
  <aside class={cn('flex min-h-0 flex-col border-r', inConversation && 'hidden lg:flex')} data-part="inbox">
    <header class="flex items-center gap-2 border-b px-4 py-3">
      <h1 class="flex-1 text-lg font-extrabold">{t('Mesajlar')}</h1>
      <Button href="/messages/new" size="sm"><NotePencilIcon />{t('Yeni mesaj')}</Button>
    </header>
    <div class="border-b p-2.5">
      <div class="relative">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input bind:value={filter} placeholder={t('Konuşmalarda ara…')} class="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm outline-none focus:border-ring" aria-label={t('Konuşmalarda ara')} />
      </div>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
      {#each items as c (c.id)}
        <a
          href="/messages/{c.id}"
          class={cn('flex items-start gap-3 rounded-md p-2.5 transition-colors', activeId === c.id ? 'bg-primary-soft' : 'hover:bg-accent')}
          aria-current={activeId === c.id ? 'page' : undefined}
        >
          <span class="relative shrink-0">
            <UserAvatar user={c.participants[0] ?? { displayName: '?', avatarUrl: null }} size={42} />
            {#if c.participantCount > 2}
              <span class="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border-2 border-card bg-muted text-muted-foreground"><UsersThreeIcon class="size-3" weight="bold" /></span>
            {/if}
          </span>
          <span class="grid min-w-0 flex-1 gap-0.5">
            <span class="flex items-center gap-2">
              <span class={cn('truncate text-sm', c.unread ? 'font-bold' : 'font-semibold')}>{title(c)}</span>
              {#if c.lastMessage}<TimeAgo ms={c.lastMessage.at} class="ml-auto shrink-0 text-[11px] text-muted-foreground" />{/if}
            </span>
            {#if c.lastMessage}
              <span class={cn('line-clamp-1 text-xs', c.unread ? 'text-foreground' : 'text-muted-foreground')}>
                {c.lastMessage.authorName}: {c.lastMessage.excerpt}
              </span>
            {/if}
          </span>
          {#if c.unread}<span class="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" aria-label={t('Okunmamış')}></span>{/if}
        </a>
      {:else}
        <div class="grid justify-items-center gap-2 px-4 py-12 text-center">
          <span class="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ChatsIcon class="size-6" weight="duotone" /></span>
          <p class="text-sm font-semibold">{filter ? t('Eşleşen konuşma yok') : t('Henüz konuşman yok')}</p>
          {#if !filter}<p class="text-xs text-muted-foreground">{t('"Yeni mesaj" ile bir üyeye yazabilirsin.')}</p>{/if}
        </div>
      {/each}
    </div>
    {#if pages > 1}
      <nav class="flex items-center justify-between border-t px-3 py-2 text-xs">
        {#if data.inbox.page > 1}<a href="?liste={data.inbox.page - 1}" class="font-semibold text-link hover:underline">← {t('Daha yeni')}</a>{:else}<span></span>{/if}
        <span class="text-muted-foreground">{data.inbox.page} / {pages}</span>
        {#if data.inbox.page < pages}<a href="?liste={data.inbox.page + 1}" class="font-semibold text-link hover:underline">{t('Daha eski')} →</a>{:else}<span></span>{/if}
      </nav>
    {/if}
  </aside>

  <!-- Konuşma / yeni mesaj -->
  <section class={cn('min-h-0 min-w-0', !inConversation && 'hidden lg:block')}>
    {@render children()}
  </section>
</div>
