<script lang="ts">
  import type { ConversationMessage, RealtimeEvent, UserSummary } from '@forum/shared';
  import { onMount, tick } from 'svelte';
  import { goto, invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import PaperPlaneIcon from 'phosphor-svelte/lib/PaperPlaneRight';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import DotsIcon from 'phosphor-svelte/lib/DotsThree';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDown';
  import UserPlusIcon from 'phosphor-svelte/lib/UserPlus';
  import UsersIcon from 'phosphor-svelte/lib/Users';
  import SignOutIcon from 'phosphor-svelte/lib/SignOut';
  import QuotesIcon from 'phosphor-svelte/lib/Quotes';
  import LinkIcon from 'phosphor-svelte/lib/Link';
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
  import { REALTIME_EVENT, realtime } from '$lib/realtime.svelte';
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
  const firstId = $derived(c.messages.page === 1 ? c.messages.items[0]?.id : undefined);

  // Okundu bilgisi: son mesajı okuyan herkes "Şu an" gibi güncel görünür
  const lastId = $derived(c.messages.items.at(-1)?.id ?? 0);

  let editor = $state<{ focus: () => void; insertBBCode: (bb: string) => void } | null>(null);
  let composer = $state<HTMLElement | null>(null);

  async function scrollToLatest(smooth = false) {
    await tick();
    const last = document.getElementById(`m${lastId}`);
    last?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  }

  // Açılışta son mesaja inilir; yeni mesaj gelince yumuşakça kaydırılır
  let seen = 0;
  $effect(() => {
    const last = lastId;
    if (last !== seen && c.messages.page === pages && c.messages.items.length > 1)
      void scrollToLatest(seen !== 0);
    seen = last;
    void counters.refresh();
  });

  // Anlık güncelleme: bu konuşmaya yeni mesaj ya da okundu bilgisi gelince yenilenir
  onMount(() => {
    const onEvent = (e: Event) => {
      const ev = (e as CustomEvent<RealtimeEvent>).detail;
      if ((ev.type === 'message' || ev.type === 'conversationRead') && ev.conversationId === c.id)
        void invalidate('app:conversation');
    };
    window.addEventListener(REALTIME_EVENT, onEvent);
    // Akış bağlı değilse (eski tarayıcı, vekil sorunu) düzenli yoklama
    const poll = setInterval(
      () =>
        !realtime.connected && document.visibilityState === 'visible' && void invalidate('app:conversation'),
      15_000,
    );
    return () => {
      window.removeEventListener(REALTIME_EVENT, onEvent);
      clearInterval(poll);
    };
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

  function quote(m: ConversationMessage) {
    const text = (new DOMParser().parseFromString(m.html, 'text/html').body.textContent ?? '')
      .trim()
      .slice(0, 2000);
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
        description: t(
          'Konuşma listenden kalkar ve yeni mesajları görmezsin. Herkes ayrılırsa konuşma silinir.',
        ),
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

<svelte:head><title>{heading} · {t('Mesajlar')}</title></svelte:head>

<div class="grid gap-4" data-part="conversation">
  <!-- Başlık ve katılımcılar -->
  <header class="rounded-2xl border bg-card shadow-card">
    <div class="flex items-start gap-3 px-5 pt-5 pb-4">
      <a
        href="/messages"
        class="-ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
        aria-label={t('Geri')}><ArrowLeftIcon class="size-5" /></a
      >
      <div class="min-w-0 flex-1">
        <h2 class="text-xl font-extrabold tracking-tight break-words sm:text-2xl">{heading}</h2>
        <p class="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <UsersIcon class="size-4" />{t('Bu yazışmada {n} üye var (sen dahil)', { n: active.length })} · {t(
            '{n} mesaj',
            { n: c.messages.total },
          )}
        </p>
      </div>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}<Button {...props} variant="outline" size="sm"
              >{t('Seçenekler')}<CaretDownIcon /></Button
            >{/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-56">
          {#if c.can.invite}<DropdownMenu.Item onSelect={() => (inviteOpen = true)}
              ><UserPlusIcon />{t('Katılımcı ekle')}</DropdownMenu.Item
            >{/if}
          <DropdownMenu.Item variant="destructive" onSelect={leave}
            ><SignOutIcon />{t('Konuşmadan ayrıl')}</DropdownMenu.Item
          >
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
    <div class="flex flex-wrap items-stretch gap-2 border-t px-5 py-3.5" data-part="participants">
      {#each c.participants as p (p.user.id)}
        <div
          class={cn(
            'flex items-center gap-2.5 rounded-xl border bg-surface-2 py-1.5 pr-3.5 pl-1.5',
            p.leftAt && 'opacity-55',
          )}
        >
          <UserAvatar user={p.user} size={34} />
          <span class="grid leading-tight">
            <UserName user={p.user} class="text-sm font-semibold" />
            <span class="text-xs text-muted-foreground">
              {#if p.leftAt}{t('Ayrıldı')}
              {:else if p.user.id === me || (p.lastReadMessageId >= lastId && lastId > 0)}{t('Okudu:')}
                {t('güncel')}
              {:else if p.lastReadAt}{t('Okudu:')} <TimeAgo ms={p.lastReadAt} />
              {:else}{t('Henüz okumadı')}{/if}
            </span>
          </span>
        </div>
      {/each}
      {#if c.can.invite}
        <button
          type="button"
          onclick={() => (inviteOpen = true)}
          class="flex items-center gap-1.5 rounded-xl border border-dashed px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          title={t('Katılımcı ekle')}
        >
          <UserPlusIcon class="size-4" />{t('Ekle')}
        </button>
      {/if}
    </div>
  </header>

  {#if c.messages.page > 1}
    <div class="text-center">
      <a
        href="?sayfa={c.messages.page - 1}"
        class="rounded-full border bg-card px-4 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >{t('Önceki mesajlar')}</a
      >
    </div>
  {/if}

  <!-- Mesajlar: forum gönderisi gibi -->
  {#each c.messages.items as m (m.id)}
    <article
      id="m{m.id}"
      class={cn('scroll-mt-24 rounded-2xl border bg-card shadow-card', m.isMine && 'border-primary/30')}
      data-part="conversation-message"
    >
      <header class="flex items-center gap-3 px-5 pt-4">
        <UserAvatar user={m.author ?? { displayName: m.authorName, avatarUrl: null }} size={44} />
        <div class="min-w-0 flex-1 leading-tight">
          {#if m.author}<UserName user={m.author} class="font-bold" />{:else}<span class="font-bold"
              >{m.authorName}</span
            >{/if}
          <p class="mt-0.5 text-xs text-muted-foreground" title={formatDateTime(m.createdAt)}>
            {m.id === firstId ? t('Yazışmayı başlattı') : t('Yanıt verdi')} · <TimeAgo ms={m.createdAt} />
          </p>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}<Button
                {...props}
                variant="ghost"
                size="icon-sm"
                aria-label={t('Mesaj işlemleri')}><DotsIcon weight="bold" /></Button
              >{/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item onSelect={() => copyLink(m)}
              ><LinkIcon />{t('Bağlantıyı kopyala')}</DropdownMenu.Item
            >
            {#if c.can.reply}<DropdownMenu.Item onSelect={() => quote(m)}
                ><QuotesIcon />{t('Alıntıla')}</DropdownMenu.Item
              >{/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </header>
      <div class="prose-forum px-5 py-4 [&_.bb-embed]:max-w-xl" data-part="post-body">{@html m.html}</div>
      {#if c.can.reply}
        <footer class="flex justify-end border-t px-4 py-2">
          <Button variant="ghost" size="sm" onclick={() => quote(m)}><QuotesIcon />{t('Alıntıla')}</Button>
        </footer>
      {/if}
    </article>
  {/each}

  {#if c.messages.page < pages}
    <div class="text-center">
      <a
        href="?sayfa={c.messages.page + 1}"
        class="rounded-full border bg-card px-4 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >{t('Sonraki mesajlar')}</a
      >
    </div>
  {/if}

  <!-- Yanıt -->
  <section
    bind:this={composer}
    class="rounded-2xl border bg-card p-4 shadow-card sm:p-5"
    data-part="conversation-reply"
  >
    {#if c.can.reply}
      <div class="flex gap-3">
        <UserAvatar user={data.viewer.user!} size={40} class="hidden shrink-0 sm:block" />
        <div class="grid min-w-0 flex-1 gap-3">
          <Editor
            bind:this={editor}
            bind:value={body}
            minHeight={120}
            maxLength={c.limits.maxLength}
            mentions={false}
            onsubmit={send}
            placeholder={t('Yanıtını yaz…')}
            draftKey="pm:{c.id}"
          />
          <div class="flex items-center justify-end gap-2">
            <span class="mr-auto hidden text-xs text-muted-foreground sm:inline"
              >{t('Göndermek için Ctrl+Enter')}</span
            >
            <Button onclick={send} disabled={sending || !body.trim()}>
              {#if sending}<LoaderIcon class="animate-spin" />{:else}<PaperPlaneIcon weight="fill" />{/if}{t(
                'Yanıt gönder',
              )}
            </Button>
          </div>
        </div>
      </div>
    {:else}
      <p
        class="flex items-center justify-center gap-2 rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground"
      >
        <LockIcon class="size-4" />{c.replyBlockedReason}
      </p>
    {/if}
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
