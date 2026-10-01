<script lang="ts">
  import type { ConversationMessage, RealtimeEvent, UserSummary } from '@forum/shared';
  import { onMount } from 'svelte';
  import { goto, invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import PaperPlaneIcon from 'phosphor-svelte/lib/PaperPlaneRight';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import DotsIcon from 'phosphor-svelte/lib/DotsThree';
  import UserPlusIcon from 'phosphor-svelte/lib/UserPlus';
  import CheckIcon from 'phosphor-svelte/lib/Checks';
  import SignOutIcon from 'phosphor-svelte/lib/SignOut';
  import QuotesIcon from 'phosphor-svelte/lib/Quotes';
  import LinkIcon from 'phosphor-svelte/lib/Link';
  import LockIcon from 'phosphor-svelte/lib/LockSimple';
  import EnvelopeIcon from 'phosphor-svelte/lib/EnvelopeSimple';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import UserPicker from '$lib/components/UserPicker.svelte';
  import GroupBadge from '$lib/components/GroupBadge.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { counters } from '$lib/counters.svelte';
  import { REALTIME_EVENT, realtime } from '$lib/realtime.svelte';
  import { formatDateTime } from '$lib/format';
  import { profileUrl } from '$lib/viewer';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  /** Özel konuşma: forumdaki bir konu gibi; her mesaj yazar sütunlu bir kart, yanıt en altta */
  let { data } = $props();
  const c = $derived(data.conversation);
  const me = $derived(data.viewer.user!.id);
  const active = $derived(c.participants.filter((p) => !p.leftAt));
  const others = $derived(active.filter((p) => p.user.id !== me));
  const heading = $derived(c.title || others.map((p) => p.user.displayName).join(', ') || t('Konuşma'));
  const lastId = $derived(c.messages.items.at(-1)?.id ?? 0);
  /** Mesajın konuşmadaki sırası (#1 = konuyu açan mesaj) */
  const numberOf = (i: number) => (c.messages.page - 1) * c.messages.perPage + i + 1;
  /** Son mesajı okuyan diğer katılımcılar */
  const seenBy = $derived(others.filter((p) => lastId > 0 && p.lastReadMessageId >= lastId && c.messages.items.at(-1)?.author?.id !== p.user.id));

  $effect(() => {
    void lastId;
    void counters.refresh();
  });

  // Anlık güncelleme: bu konuşmaya yeni mesaj ya da okundu bilgisi gelince yenilenir
  onMount(() => {
    // Uzun yazışmada açılınca son mesaja gidilir (bağlantıda #m… varsa ona)
    if (!location.hash && c.messages.items.length > 2) document.getElementById(`m${lastId}`)?.scrollIntoView({ block: 'start' });
    const onEvent = (e: Event) => {
      const ev = (e as CustomEvent<RealtimeEvent>).detail;
      if ((ev.type === 'message' || ev.type === 'conversationRead') && ev.conversationId === c.id) void invalidate('app:conversation');
    };
    window.addEventListener(REALTIME_EVENT, onEvent);
    const poll = setInterval(() => !realtime.connected && document.visibilityState === 'visible' && void invalidate('app:conversation'), 15_000);
    return () => {
      window.removeEventListener(REALTIME_EVENT, onEvent);
      clearInterval(poll);
    };
  });

  let editor = $state<{ focus: () => void; insertBBCode: (bb: string) => void } | null>(null);
  let composer = $state<HTMLElement | null>(null);
  let body = $state('');
  let sending = $state(false);
  async function send() {
    if (!body.trim() || sending) return;
    sending = true;
    try {
      const res = await api.post<{ messageId: number }>(`/api/messages/${c.id}`, { body });
      body = '';
      await Promise.all([invalidate('app:conversation'), invalidate('app:messages')]);
      document.getElementById(`m${res?.messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      sending = false;
    }
  }

  function quote(m: ConversationMessage) {
    const text = (new DOMParser().parseFromString(m.html, 'text/html').body.textContent ?? '').trim().slice(0, 2000);
    editor?.insertBBCode(`[quote=${m.authorName}]${text}[/quote]\n`);
    composer?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    editor?.focus();
  }

  async function copyLink(m: ConversationMessage) {
    try {
      await navigator.clipboard.writeText(`${location.origin}/messages/${c.id}#m${m.id}`);
      toast.success(t('Bağlantı kopyalandı.'));
    } catch {
      toast.error(t('Kopyalanamadı.'));
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
    if (
      !(await confirmAction({
        title: t('Konuşmadan ayrılınsın mı?'),
        description: t('Konuşma listenden kalkar ve yeni mesajları görmezsin. Herkes ayrılırsa konuşma silinir.'),
        confirmLabel: t('Ayrıl'),
        destructive: true,
      }))
    )
      return;
    try {
      await api.post(`/api/messages/${c.id}/leave`);
      await invalidate('app:messages');
      await goto('/messages');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<svelte:head><title>{heading} · {t('Özel mesajlar')}</title></svelte:head>

<div class="grid gap-5" data-part="conversation">
  <!-- Konu başlığı -->
  <header class="grid gap-3">
    <a href="/messages" class="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon class="size-4" />{t('Özel mesajlar')}</a>
    <div class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1">
        <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight break-words">
          <EnvelopeIcon class="size-6 shrink-0 text-muted-foreground" />{heading}
        </h1>
        <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground" data-part="participants">
          <span class="flex items-center -space-x-1.5">
            {#each active.slice(0, 6) as p (p.user.id)}<a href={profileUrl(p.user)} title={p.user.displayName}><UserAvatar user={p.user} size={24} class="ring-2 ring-background" /></a>{/each}
          </span>
          <span class="flex flex-wrap gap-x-1">
            {#each active as p, i (p.user.id)}<span class="inline-flex"><UserName user={p.user} class="text-sm" />{#if i < active.length - 1}<span>,</span>{/if}</span>{/each}
          </span>
          <span>· {t('{n} mesaj', { n: c.messages.total })}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        {#if c.can.invite}<Button variant="outline" size="sm" onclick={() => (inviteOpen = true)}><UserPlusIcon />{t('Katılımcı ekle')}</Button>{/if}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}<Button {...props} variant="outline" size="icon-sm" aria-label={t('Seçenekler')}><DotsIcon weight="bold" /></Button>{/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-56">
            <DropdownMenu.Item variant="destructive" onSelect={leave}><SignOutIcon />{t('Konuşmadan ayrıl')}</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  </header>

  {#if c.messages.total > c.messages.perPage}<Pagination page={c.messages.page} perPage={c.messages.perPage} total={c.messages.total} param="sayfa" />{/if}

  <!-- Mesajlar: forum gönderisi gibi -->
  {#each c.messages.items as m, i (m.id)}
    {@const author = m.author}
    <article id="m{m.id}" class="scroll-mt-24 overflow-hidden rounded-xl border bg-card shadow-card target:ring-2 target:ring-primary/60" data-part="conversation-message">
      <div class="grid md:grid-cols-[12rem_1fr]">
        <aside data-part="post-author" class="flex items-center gap-3 border-b bg-[color-mix(in_oklch,var(--muted)_45%,var(--card))] p-3 md:flex-col md:items-center md:gap-2 md:border-r md:border-b-0 md:p-5 md:text-center">
          {#if author}
            <a href={profileUrl(author)} class="shrink-0">
              <UserAvatar user={author} size={80} shape="rounded" class="hidden md:inline-flex" />
              <UserAvatar user={author} size={40} shape="rounded" class="md:hidden" />
            </a>
            <div class="min-w-0 md:w-full">
              <UserName user={author} class="max-w-full text-[15px] md:justify-center" />
              {#if author.customTitle}<p class="truncate text-xs text-muted-foreground">{author.customTitle}</p>{/if}
              {#if author.primaryGroup}<div class="mt-1.5 hidden justify-center md:flex"><GroupBadge group={author.primaryGroup} /></div>
                <p class="text-xs text-muted-foreground md:hidden">{tc(author.primaryGroup.name)}</p>{/if}
            </div>
          {:else}
            <UserAvatar user={{ displayName: m.authorName || '?', avatarUrl: null }} size={40} />
            <span class="font-medium text-muted-foreground">{m.authorName}</span>
          {/if}
        </aside>
        <div class="flex min-w-0 flex-col">
          <header class="flex items-center gap-2 border-b px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
            <span title={formatDateTime(m.createdAt)}>{numberOf(i) === 1 ? t('Gönderildi') : t('Yanıt')}: <TimeAgo ms={m.createdAt} /></span>
            <span class="ml-auto flex items-center gap-1">
              <a href="#m{m.id}" class="rounded px-1.5 py-0.5 font-medium tabular-nums hover:bg-accent hover:text-foreground">#{numberOf(i)}</a>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger class="rounded-md p-1 hover:bg-accent hover:text-foreground" aria-label={t('Mesaj işlemleri')}><DotsIcon class="size-4" /></DropdownMenu.Trigger>
                <DropdownMenu.Content align="end" class="w-48">
                  <DropdownMenu.Item onSelect={() => copyLink(m)}><LinkIcon />{t('Bağlantıyı kopyala')}</DropdownMenu.Item>
                  {#if c.can.reply}<DropdownMenu.Item onSelect={() => quote(m)}><QuotesIcon />{t('Alıntıla')}</DropdownMenu.Item>{/if}
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </span>
          </header>
          <div class="prose-forum flex-1 px-4 py-4 sm:px-5 [&_.bb-embed]:max-w-xl" data-part="post-body">{@html m.html}</div>
          {#if c.can.reply}
            <footer class="flex justify-end px-3 pb-2">
              <Button variant="ghost" size="sm" onclick={() => quote(m)}><QuotesIcon />{t('Alıntıla')}</Button>
            </footer>
          {/if}
        </div>
      </div>
    </article>
  {/each}

  {#if seenBy.length}
    <p class="-mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground" data-part="seen-by">
      <CheckIcon class="size-4 text-primary" />{t('Gördü: {names}', { names: seenBy.map((p) => p.user.displayName).join(', ') })}
    </p>
  {/if}

  {#if c.messages.total > c.messages.perPage}<Pagination page={c.messages.page} perPage={c.messages.perPage} total={c.messages.total} param="sayfa" />{/if}

  <!-- Yanıt (konudaki hızlı yanıt gibi) -->
  <section bind:this={composer} class="overflow-hidden rounded-xl border bg-card shadow-card" data-part="conversation-reply">
    <h2 class="border-b px-4 py-3 text-sm font-semibold sm:px-5">{t('Yanıt yaz')}</h2>
    <div class="p-4 sm:p-5">
      {#if c.can.reply}
        <div class="flex gap-4">
          <UserAvatar user={data.viewer.user!} size={44} shape="rounded" class="hidden shrink-0 sm:inline-flex" />
          <div class="grid min-w-0 flex-1 gap-3">
            <Editor bind:this={editor} bind:value={body} minHeight={150} maxLength={c.limits.maxLength} mentions={false} onsubmit={send} placeholder={t('Yanıtını yaz…')} draftKey="pm:{c.id}" />
            <div class="flex items-center justify-end gap-2">
              <span class="mr-auto hidden text-xs text-muted-foreground sm:inline">{t('Göndermek için Ctrl+Enter')}</span>
              <Button onclick={send} disabled={sending || !body.trim()}>{#if sending}<LoaderIcon class="animate-spin" />{:else}<PaperPlaneIcon weight="fill" />{/if}{t('Yanıt gönder')}</Button>
            </div>
          </div>
        </div>
      {:else}
        <p class="flex items-center justify-center gap-2 rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground"><LockIcon class="size-4" />{c.replyBlockedReason}</p>
      {/if}
    </div>
  </section>
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
