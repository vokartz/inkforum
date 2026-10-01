<script lang="ts">
  import type { RealtimeEvent, Shout } from '@forum/shared';
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import ChatDotsIcon from 'phosphor-svelte/lib/ChatCenteredDots';
  import PaperPlaneIcon from 'phosphor-svelte/lib/PaperPlaneRight';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import { toast } from 'svelte-sonner';
  import Widget from '../Widget.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import UserName from '../UserName.svelte';
  import { api, errorMessage } from '$lib/api';
  import { REALTIME_EVENT, realtime } from '$lib/realtime.svelte';
  import { loginHref } from '$lib/nav-auth';
  import { formatClock, formatDateTime } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  /** Sohbet kutusu: üyeler anlık akışla, misafirler 20 sn'de bir güncel mesajları görür */
  let { title = null, compact = false }: { title?: string | null; compact?: boolean } = $props();

  let items = $state<Shout[]>([]);
  let canPost = $state(false);
  let canModerate = $state(false);
  let maxLength = $state(300);
  let loaded = $state(false);
  let hidden = $state(false);
  let body = $state('');
  let sending = $state(false);
  let list = $state<HTMLElement | null>(null);
  const me = $derived(page.data.viewer?.user?.id ?? 0);
  /** Aynı kişinin 5 dakika içindeki art arda mesajları tek başlık altında toplanır */
  const grouped = $derived(items.map((s, i) => ({ s, head: i === 0 || items[i - 1]!.user.id !== s.user.id || s.createdAt - items[i - 1]!.createdAt > 5 * 60_000 })));
  const left = $derived(maxLength - body.length);

  async function toBottom() {
    await tick();
    list?.scrollTo({ top: list.scrollHeight });
  }

  async function load() {
    try {
      const res = await api.get<{
        items: Shout[];
        canPost: boolean;
        canModerate: boolean;
        maxLength: number;
      }>('/api/shoutbox');
      items = res.items;
      canPost = res.canPost;
      canModerate = res.canModerate;
      maxLength = res.maxLength;
      void toBottom();
    } catch {
      hidden = true; // misafirlere kapalı ya da eklenti kapalı
    } finally {
      loaded = true;
    }
  }

  onMount(() => {
    void load();
    const onEvent = (e: Event) => {
      const ev = (e as CustomEvent<RealtimeEvent>).detail;
      if (ev.type === 'shout' && !items.some((s) => s.id === ev.shout.id)) {
        items = [...items, { ...ev.shout, canDelete: canModerate || ev.shout.user.id === me }].slice(-100);
        void toBottom();
      } else if (ev.type === 'shoutDeleted') items = items.filter((s) => s.id !== ev.id);
    };
    window.addEventListener(REALTIME_EVENT, onEvent);
    const poll = setInterval(
      () => !realtime.connected && document.visibilityState === 'visible' && void load(),
      20_000,
    );
    return () => {
      window.removeEventListener(REALTIME_EVENT, onEvent);
      clearInterval(poll);
    };
  });

  async function send(e?: SubmitEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    sending = true;
    try {
      const shout = await api.post<Shout>('/api/shoutbox', { body: text });
      if (!items.some((s) => s.id === shout.id)) items = [...items, shout];
      body = '';
      void toBottom();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      sending = false;
    }
  }

  async function remove(s: Shout) {
    try {
      await api.delete(`/api/shoutbox/${s.id}`);
      items = items.filter((x) => x.id !== s.id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }
</script>

{#if !hidden}
  <Widget title={title || t('Sohbet kutusu')} icon={ChatDotsIcon} flush class="animate-rise">
    <div
      bind:this={list}
      class={cn('overflow-y-auto px-4 pb-2', compact ? 'h-72' : 'h-80')}
      data-part="shoutbox"
      aria-live="polite"
    >
      {#if !loaded}
        <div class="flex h-full items-center justify-center">
          <LoaderIcon class="size-5 animate-spin text-muted-foreground" />
        </div>
      {:else if !items.length}
        <p class="flex h-full items-center justify-center text-sm text-muted-foreground">{t('Henüz mesaj yok. İlk sen yaz!')}</p>
      {/if}
      {#each grouped as { s, head } (s.id)}
        <div class={cn('group relative flex gap-2.5', head ? 'mt-3 first:mt-1' : 'mt-0.5')} data-part="shout">
          <div class="w-7 shrink-0">
            {#if head}<UserAvatar user={s.user} size={28} class="mt-0.5" />{/if}
          </div>
          <div class="min-w-0 flex-1 pr-10">
            {#if head}
              <p class="flex items-baseline gap-2 leading-tight">
                <UserName user={s.user} class="text-[13px] font-semibold" />
                <time class="text-[11px] text-muted-foreground tabular-nums" title={formatDateTime(s.createdAt)}>{formatClock(s.createdAt)}</time>
              </p>
            {/if}
            <p class="text-[13.5px] leading-snug break-words whitespace-pre-wrap text-foreground/90">{s.body}</p>
          </div>
          <div class="absolute top-0 right-0 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {#if !head}<time class="text-[10px] text-muted-foreground tabular-nums" title={formatDateTime(s.createdAt)}>{formatClock(s.createdAt)}</time>{/if}
            {#if s.canDelete}
              <button type="button" class="rounded p-1 text-muted-foreground hover:text-destructive" onclick={() => remove(s)} aria-label={t('Sil')}>
                <TrashIcon class="size-3.5" />
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    {#if canPost}
      <form class="mx-3 mb-1 flex items-center gap-1 rounded-xl bg-muted/70 py-1 pr-1 pl-3 focus-within:ring-2 focus-within:ring-ring/30" onsubmit={send}>
        <input
          bind:value={body}
          maxlength={maxLength}
          placeholder={t('Bir şeyler yaz…')}
          class="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label={t('Sohbet mesajı')}
        />
        {#if left <= 40}<span class={cn('text-[11px] tabular-nums', left < 10 ? 'text-destructive' : 'text-muted-foreground')}>{left}</span>{/if}
        <button
          type="submit"
          disabled={sending || !body.trim()}
          class="flex size-8 shrink-0 items-center justify-center rounded-lg text-primary transition-colors hover:bg-background disabled:text-muted-foreground disabled:hover:bg-transparent"
          aria-label={t('Gönder')}
        >
          {#if sending}<LoaderIcon class="size-4 animate-spin" />{:else}<PaperPlaneIcon class="size-4" weight="fill" />{/if}
        </button>
      </form>
    {:else}
      <p class="border-t px-4 pt-2.5 text-center text-xs text-muted-foreground">
        <a href={loginHref()} class="font-semibold text-link hover:underline">{t('Giriş yap')}</a>
        {t('ve sohbete katıl.')}
      </p>
    {/if}
  </Widget>
{/if}
