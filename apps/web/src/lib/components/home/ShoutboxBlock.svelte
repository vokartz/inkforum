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
  import TimeAgo from '../TimeAgo.svelte';
  import { api, errorMessage } from '$lib/api';
  import { REALTIME_EVENT, realtime } from '$lib/realtime.svelte';
  import { loginHref } from '$lib/nav-auth';
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
      class={cn('grid content-start gap-0.5 overflow-y-auto px-2', compact ? 'h-72' : 'h-80')}
      data-part="shoutbox"
    >
      {#if !loaded}
        <div class="flex justify-center py-10">
          <LoaderIcon class="size-5 animate-spin text-muted-foreground" />
        </div>
      {:else if !items.length}
        <p class="py-10 text-center text-sm text-muted-foreground">{t('Henüz mesaj yok. İlk sen yaz!')}</p>
      {/if}
      {#each items as s (s.id)}
        <div class="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-row-hover">
          <UserAvatar user={s.user} size={28} class="mt-0.5" />
          <div class="min-w-0 flex-1 text-sm">
            <span class="mr-1.5"><UserName user={s.user} class="text-[13px] font-bold" /></span>
            <span class="text-[11px] text-muted-foreground"><TimeAgo ms={s.createdAt} /></span>
            <p class="break-words whitespace-pre-wrap">{s.body}</p>
          </div>
          {#if s.canDelete}
            <button
              type="button"
              class="rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus:opacity-100"
              onclick={() => remove(s)}
              aria-label={t('Sil')}
            >
              <TrashIcon class="size-3.5" />
            </button>
          {/if}
        </div>
      {/each}
    </div>
    <div class="border-t px-3 pt-2.5">
      {#if canPost}
        <form class="flex items-center gap-2" onsubmit={send}>
          <input
            bind:value={body}
            maxlength={maxLength}
            placeholder={t('Bir şeyler yaz…')}
            class="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:border-ring"
            aria-label={t('Sohbet mesajı')}
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-50"
            aria-label={t('Gönder')}
          >
            {#if sending}<LoaderIcon class="size-4 animate-spin" />{:else}<PaperPlaneIcon
                class="size-4"
                weight="fill"
              />{/if}
          </button>
        </form>
      {:else}
        <p class="pb-0.5 text-center text-xs text-muted-foreground">
          <a href={loginHref()} class="font-semibold text-link hover:underline">{t('Giriş yap')}</a>
          {t('ve sohbete katıl.')}
        </p>
      {/if}
    </div>
  </Widget>
{/if}
