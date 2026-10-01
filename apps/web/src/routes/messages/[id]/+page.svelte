<script lang="ts">
  import type { ConversationMessage, UserSummary } from '@forum/shared';
  import { tick } from 'svelte';
  import { goto, invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import PaperPlaneIcon from 'phosphor-svelte/lib/PaperPlaneRight';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import DotsIcon from 'phosphor-svelte/lib/DotsThreeVertical';
  import UserPlusIcon from 'phosphor-svelte/lib/UserPlus';
  import SignOutIcon from 'phosphor-svelte/lib/SignOut';
  import ChecksIcon from 'phosphor-svelte/lib/Checks';
  import LockIcon from 'phosphor-svelte/lib/LockSimple';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import UserPicker from '$lib/components/UserPicker.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { counters } from '$lib/counters.svelte';
  import { formatDateTime } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const c = $derived(data.conversation);
  const me = $derived(data.viewer.user!.id);
  const active = $derived(c.participants.filter((p) => !p.leftAt));
  const others = $derived(active.filter((p) => p.user.id !== me));
  const heading = $derived(c.title || others.map((p) => p.user.displayName).join(', ') || t('Konuşma'));
  const pages = $derived(Math.max(1, Math.ceil(c.messages.total / c.messages.perPage)));

  // Aynı üyenin art arda (5 dk içinde) gönderdiği mesajlar tek grupta gösterilir.
  const groups = $derived.by(() => {
    const out: Array<{ author: UserSummary | null; authorName: string; mine: boolean; items: ConversationMessage[] }> = [];
    for (const m of c.messages.items) {
      const last = out.at(-1);
      const prev = last?.items.at(-1);
      if (last && prev && last.authorName === m.authorName && m.createdAt - prev.createdAt < 5 * 60_000) last.items.push(m);
      else out.push({ author: m.author, authorName: m.authorName, mine: m.isMine, items: [m] });
    }
    return out;
  });
  // Son mesajımı herkes okuduysa "Görüldü"
  const lastMine = $derived([...c.messages.items].reverse().find((m) => m.isMine));
  const seenByAll = $derived(!!lastMine && others.length > 0 && others.every((p) => p.lastReadMessageId >= lastMine.id));

  let scroller = $state<HTMLElement | null>(null);
  async function toBottom(smooth = false) {
    await tick();
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }
  // Açılışta ve yeni mesajlarda en alta in; bu konuşma okundu sayıldı.
  let lastSeenId = 0;
  $effect(() => {
    const last = c.messages.items.at(-1)?.id ?? 0;
    if (last !== lastSeenId && c.messages.page === pages) void toBottom(lastSeenId !== 0);
    lastSeenId = last;
    void counters.refresh();
  });

  // Konuşma açıkken yeni mesajlar için düzenli yenileme
  $effect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && void invalidate('app:conversation'), 15_000);
    return () => clearInterval(t);
  });

  let body = $state('');
  let sending = $state(false);
  async function send() {
    if (!body.trim() || sending) return;
    sending = true;
    try {
      await api.post(`/api/messages/${c.id}`, { body });
      body = '';
      await Promise.all([invalidate('app:conversation'), invalidate('app:messages')]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      sending = false;
    }
  }

  let inviteOpen = $state(false);
  async function invite(u: UserSummary) {
    try {
      await api.post(`/api/messages/${c.id}/invite`, { userIds: [u.id] });
      toast.success(t('{name} konuşmaya eklendi.', { name: u.displayName }));
      inviteOpen = false;
      await invalidate('app:conversation');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function leave() {
    if (!(await confirmAction({ title: t('Konuşmadan ayrılınsın mı?'), description: t('Konuşma listenden kalkar ve yeni mesajları görmezsin. Herkes ayrılırsa konuşma silinir.'), confirmLabel: t('Ayrıl'), destructive: true }))) return;
    try {
      await api.post(`/api/messages/${c.id}/leave`);
      await invalidate('app:messages');
      await goto('/messages');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<svelte:head><title>{heading} · {t('Mesajlar')}</title></svelte:head>

<div class="flex h-full flex-col" data-part="conversation">
  <header class="flex items-center gap-3 border-b px-3 py-2.5 sm:px-4">
    <a href="/messages" class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden" aria-label={t('Geri')}><ArrowLeftIcon class="size-5" /></a>
    <div class="flex -space-x-2">
      {#each others.slice(0, 3) as p (p.user.id)}<UserAvatar user={p.user} size={36} class="ring-2 ring-card" />{/each}
    </div>
    <div class="min-w-0 flex-1">
      <h2 class="truncate font-bold">{heading}</h2>
      <p class="truncate text-xs text-muted-foreground">
        {#if c.title}{others.map((p) => p.user.displayName).join(', ')} · {/if}{t('{n} katılımcı', { n: active.length })} · {t('{n} mesaj', { n: c.messages.total })}
      </p>
    </div>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}<Button {...props} variant="ghost" size="icon" aria-label={t('Konuşma işlemleri')}><DotsIcon weight="bold" /></Button>{/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-60">
        <DropdownMenu.Label class="text-xs text-muted-foreground">{t('Katılımcılar')}</DropdownMenu.Label>
        {#each c.participants as p (p.user.id)}
          <div class={cn('flex items-center gap-2 px-2 py-1.5 text-sm', p.leftAt && 'opacity-50')}>
            <UserAvatar user={p.user} size={24} /><UserName user={p.user} class="text-sm" />
            {#if p.isCreator}<span class="ml-auto text-[10px] font-bold text-muted-foreground">{t('BAŞLATAN')}</span>{:else if p.leftAt}<span class="ml-auto text-[10px] text-muted-foreground">{t('ayrıldı')}</span>{/if}
          </div>
        {/each}
        <DropdownMenu.Separator />
        {#if c.can.invite}<DropdownMenu.Item onSelect={() => (inviteOpen = true)}><UserPlusIcon />{t('Katılımcı ekle')}</DropdownMenu.Item>{/if}
        <DropdownMenu.Item variant="destructive" onSelect={leave}><SignOutIcon />{t('Konuşmadan ayrıl')}</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </header>

  <!-- Mesajlar -->
  <div bind:this={scroller} class="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5" data-part="conversation-messages">
    {#if c.messages.page > 1}
      <div class="mb-4 text-center">
        <a href="?sayfa={c.messages.page - 1}" class="rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">{t('Önceki mesajlar')}</a>
      </div>
    {/if}
    <div class="grid gap-4">
      {#each groups as g, gi (gi)}
        <div class={cn('flex items-end gap-2.5', g.mine && 'flex-row-reverse')}>
          {#if !g.mine}<UserAvatar user={g.author ?? { displayName: g.authorName, avatarUrl: null }} size={32} class="mb-0.5" />{/if}
          <div class={cn('grid max-w-[min(85%,42rem)] gap-1', g.mine && 'justify-items-end')}>
            <p class={cn('px-1 text-xs text-muted-foreground', g.mine && 'text-right')}>
              {#if !g.mine}<span class="font-semibold text-foreground">{g.authorName}</span> · {/if}<span title={formatDateTime(g.items[0]!.createdAt)}><TimeAgo ms={g.items[0]!.createdAt} /></span>
            </p>
            {#each g.items as m (m.id)}
              <div
                class={cn(
                  'prose-forum rounded-2xl px-3.5 py-2 text-sm [&_.bb-embed]:max-w-md',
                  g.mine ? 'rounded-br-md bg-primary text-primary-foreground [&_a]:text-primary-foreground' : 'rounded-bl-md bg-muted',
                )}
                title={formatDateTime(m.createdAt)}
              >
                {@html m.html}
              </div>
            {/each}
            {#if g.mine && lastMine && g.items.some((m) => m.id === lastMine.id) && seenByAll}
              <span class="flex items-center gap-1 px-1 text-[11px] text-muted-foreground"><ChecksIcon class="size-3.5 text-primary" weight="bold" />{t('Görüldü')}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    {#if c.messages.page < pages}
      <div class="mt-4 text-center">
        <a href="?sayfa={c.messages.page + 1}" class="rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">{t('Sonraki mesajlar')}</a>
      </div>
    {/if}
  </div>

  <!-- Yazma alanı -->
  <footer class="border-t p-3 sm:p-4">
    {#if c.can.reply}
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1">
          <Editor bind:value={body} compact minHeight={60} maxLength={c.limits.maxLength} mentions={false} onsubmit={send} placeholder={t('Bir mesaj yaz…')} draftKey="pm:{c.id}" />
        </div>
        <Button onclick={send} disabled={sending || !body.trim()} size="icon-lg" title={t('Gönder (Ctrl+Enter)')} aria-label={t('Gönder')}>
          {#if sending}<LoaderIcon class="animate-spin" />{:else}<PaperPlaneIcon weight="fill" />{/if}
        </Button>
      </div>
    {:else}
      <p class="flex items-center justify-center gap-2 rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground"><LockIcon class="size-4" />{c.replyBlockedReason}</p>
    {/if}
  </footer>
</div>

<Dialog.Root bind:open={inviteOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{t('Katılımcı ekle')}</Dialog.Title>
      <Dialog.Description>{t('Eklenen üye konuşmanın tamamını görebilir.')}</Dialog.Description>
    </Dialog.Header>
    <UserPicker placeholder={t('Üye adı yazın…')} exclude={active.map((p) => p.user.id)} onpick={invite} />
  </Dialog.Content>
</Dialog.Root>
