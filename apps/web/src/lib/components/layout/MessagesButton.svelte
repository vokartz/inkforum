<script lang="ts">
  import type { ConversationListItem, Paginated } from '@forum/shared';
  import EnvelopeIcon from 'phosphor-svelte/lib/EnvelopeSimple';
  import NotePencilIcon from 'phosphor-svelte/lib/NotePencil';
  import ChatsIcon from 'phosphor-svelte/lib/ChatsTeardrop';
  import * as Popover from '$lib/components/ui/popover';
  import { buttonVariants } from '$lib/components/ui/button';
  import { api } from '$lib/api';
  import { counters } from '$lib/counters.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import TimeAgo from '../TimeAgo.svelte';

  let { class: className }: { class?: string } = $props();
  let open = $state(false);
  let items = $state<ConversationListItem[] | null>(null);

  async function load() {
    try {
      items = (await api.get<Paginated<ConversationListItem>>('/api/messages?page=1')).items.slice(0, 6);
    } catch {
      items = [];
    }
  }
  const title = (c: ConversationListItem) => c.title || c.participants.map((p) => p.displayName).join(', ') || t('Konuşma');
</script>

<Popover.Root bind:open onOpenChange={(o) => o && load()}>
  <Popover.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative', className)} aria-label={t('Özel mesajlar')} data-part="messages-button">
    <EnvelopeIcon class="size-5" weight={counters.messages > 0 ? 'fill' : 'bold'} />
    {#if counters.messages > 0}
      <span class="absolute top-0.5 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-primary px-1 text-[10px] font-bold text-primary-foreground">
        {counters.messages > 99 ? '99+' : counters.messages}
      </span>
    {/if}
  </Popover.Trigger>
  <Popover.Content align="end" class="w-[23rem] gap-0 overflow-hidden p-0">
    <div class="flex items-center justify-between px-4 pt-3.5 pb-2.5">
      <span class="text-base font-extrabold">{t('Mesajlar')}</span>
      <a href="/messages/new" onclick={() => (open = false)} class="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline"><NotePencilIcon class="size-3.5" />{t('Yeni mesaj')}</a>
    </div>
    <div class="max-h-[26rem] overflow-auto px-1.5 pb-1.5">
      {#if items === null}
        {#each [0, 1, 2] as i (i)}
          <div class="flex gap-3 p-2.5"><span class="size-10 shrink-0 rounded-full shimmer"></span><span class="grid flex-1 gap-2 py-1"><span class="h-3 w-3/5 rounded shimmer"></span><span class="h-2.5 w-4/5 rounded shimmer"></span></span></div>
        {/each}
      {:else if !items.length}
        <div class="grid justify-items-center gap-2 px-4 py-10 text-center">
          <span class="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ChatsIcon class="size-6" weight="duotone" /></span>
          <p class="text-sm font-semibold">{t('Henüz mesajın yok')}</p>
          <p class="text-xs text-muted-foreground">{t('Bir üyenin profilinden ya da "Yeni mesaj" ile konuşma başlatabilirsin.')}</p>
        </div>
      {:else}
        {#each items as c (c.id)}
          <a href="/messages/{c.id}" onclick={() => (open = false)} class="flex items-start gap-3 rounded-md p-2.5 transition-colors hover:bg-accent">
            <UserAvatar user={c.participants[0] ?? { displayName: '?', avatarUrl: null }} size={40} />
            <span class="grid min-w-0 flex-1 gap-0.5">
              <span class="flex items-center gap-2">
                <span class={cn('truncate text-sm', c.unread ? 'font-bold' : 'font-medium')}>{title(c)}</span>
                {#if c.lastMessage}<TimeAgo ms={c.lastMessage.at} class="ml-auto shrink-0 text-[11px] text-muted-foreground" />{/if}
              </span>
              {#if c.lastMessage}<span class={cn('line-clamp-1 text-xs', c.unread ? 'text-foreground' : 'text-muted-foreground')}>{c.lastMessage.authorName}: {c.lastMessage.excerpt}</span>{/if}
            </span>
            {#if c.unread}<span class="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary"></span>{/if}
          </a>
        {/each}
      {/if}
    </div>
    <a href="/messages" class="block border-t px-3 py-2.5 text-center text-sm font-semibold text-link hover:bg-accent" onclick={() => (open = false)}>{t('Tüm mesajları gör')}</a>
  </Popover.Content>
</Popover.Root>
