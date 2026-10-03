<script lang="ts">
  import BellIcon from 'phosphor-svelte/lib/Bell';
  import ChecksIcon from 'phosphor-svelte/lib/Checks';
  import BellSlashIcon from 'phosphor-svelte/lib/BellSlash';
  import { goto, invalidate } from '$app/navigation';
  import * as Popover from '$lib/components/ui/popover';
  import { buttonVariants } from '$lib/components/ui/button';
  import { api } from '$lib/api';
  import { describeNotification, notificationVisual, type NotificationItem } from '$lib/notifications';
  import TimeAgo from '../TimeAgo.svelte';
  import { cn } from '$lib/utils';
  import { counters } from '$lib/counters.svelte';
  import { sounds } from '$lib/sounds.svelte';
  import { REALTIME_EVENT } from '$lib/realtime.svelte';
  import SpeakerIcon from 'phosphor-svelte/lib/SpeakerHigh';
  import SpeakerOffIcon from 'phosphor-svelte/lib/SpeakerSlash';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n.svelte';

  let { unread: _initial = 0, class: className }: { unread?: number; class?: string } = $props();
  const unread = $derived(counters.notifications);

  let open = $state(false);
  let items = $state<NotificationItem[]>([]);
  let loading = $state(false);

  async function load() {
    loading = true;
    try {
      const res = await api.get<{ items: NotificationItem[] }>('/api/me/notifications?perPage=8');
      items = res.items;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const onEvent = (e: Event) => {
      if ((e as CustomEvent<{ type: string }>).detail.type === 'notification' && open) void load();
    };
    window.addEventListener(REALTIME_EVENT, onEvent);
    return () => window.removeEventListener(REALTIME_EVENT, onEvent);
  });

  async function openItem(n: NotificationItem) {
    const { href } = describeNotification(n);
    if (!n.readAt) {
      await api.post('/api/me/notifications/read', { ids: [n.id] });
      await invalidate('app:viewer');
    }
    open = false;
    if (href) await goto(href);
  }

  async function markAll() {
    await api.post('/api/me/notifications/read', { ids: 'all' });
    items = items.map((i) => ({ ...i, readAt: i.readAt ?? Date.now() }));
    counters.set({ notifications: 0 });
    await invalidate('app:viewer');
  }
</script>

<Popover.Root
  bind:open
  onOpenChange={(o) => {
    if (o) load();
  }}
>
  <Popover.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative', className)} aria-label={t('Bildirimler')} data-part="notification-bell">
    <BellIcon class={cn('size-5', unread > 0 && 'origin-top animate-[forum-ring_1s_ease-in-out_1]')} weight={unread > 0 ? 'fill' : 'bold'} />
    {#if unread > 0}
      <span
        class="absolute top-0.5 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-background bg-primary px-1 text-[10px] font-bold text-primary-foreground animate-pop"
      >
        {unread > 99 ? '99+' : unread}
      </span>
    {/if}
  </Popover.Trigger>
  <Popover.Content align="end" class="w-[23rem] gap-0 overflow-hidden p-0">
    <div class="flex items-center justify-between px-4 pt-3.5 pb-2.5">
      <span class="text-base font-extrabold">{t('Bildirimler')}</span>
      <span class="flex items-center gap-3">
        {#if unread > 0}
          <button type="button" class="inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline" onclick={markAll}>
            <ChecksIcon class="size-3.5" />{t('Tümünü okundu say')}
          </button>
        {/if}
        <button
          type="button"
          class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onclick={() => sounds.toggle()}
          title={sounds.enabled ? t('Bildirim sesini kapat') : t('Bildirim sesini aç')}
          aria-pressed={sounds.enabled}
          data-part="sound-toggle"
        >
          {#if sounds.enabled}<SpeakerIcon class="size-4" />{:else}<SpeakerOffIcon class="size-4" />{/if}
        </button>
      </span>
    </div>
    <div class="max-h-[26rem] overflow-auto px-1.5 pb-1.5">
      {#if loading && !items.length}
        {#each [0, 1, 2] as i (i)}
          <div class="flex gap-3 p-2.5">
            <span class="size-10 shrink-0 rounded-xl shimmer"></span>
            <span class="grid flex-1 gap-2 py-1"><span class="h-3 w-4/5 rounded shimmer"></span><span class="h-2.5 w-1/3 rounded shimmer"></span></span>
          </div>
        {/each}
      {:else if !items.length}
        <div class="grid justify-items-center gap-2 px-4 py-10 text-center">
          <span class="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><BellSlashIcon class="size-6" weight="duotone" /></span>
          <p class="text-sm font-semibold">{t('Henüz bildirim yok')}</p>
          <p class="text-xs text-muted-foreground">{t('Yanıtlar, bahsetmeler ve başarılar burada görünür.')}</p>
        </div>
      {:else}
        {#each items as n, i (n.id)}
          {@const v = notificationVisual(n)}
          <button
            type="button"
            style="--i:{i}"
            class="group flex w-full items-start gap-3 rounded-xl p-2.5 text-left text-sm transition-colors animate-rise hover:bg-accent"
            onclick={() => openItem(n)}
          >
            <span class="relative flex size-10 shrink-0 items-center justify-center rounded-xl" style="background:color-mix(in oklch, {v.color} 16%, transparent);color:{v.color}">
              <v.icon class="size-5" weight="duotone" />
            </span>
            <span class="grid min-w-0 flex-1 gap-0.5">
              <span class={cn('line-clamp-2 leading-snug', n.readAt ? 'text-muted-foreground' : 'font-medium')}>{describeNotification(n).text}</span>
              <TimeAgo ms={n.createdAt} class="text-xs text-muted-foreground" />
            </span>
            {#if !n.readAt}<span class="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary shadow-[0_0_0_3px_var(--primary-soft)]"></span>{/if}
          </button>
        {/each}
      {/if}
    </div>
    <a href="/notifications" class="block border-t px-3 py-2.5 text-center text-sm font-semibold text-link hover:bg-accent" onclick={() => (open = false)}>
      {t('Tüm bildirimleri gör')}
    </a>
  </Popover.Content>
</Popover.Root>
