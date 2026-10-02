<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidate } from '$app/navigation';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import ChecksIcon from 'phosphor-svelte/lib/Checks';
  import GearIcon from 'phosphor-svelte/lib/GearSix';
  import BellIcon from 'phosphor-svelte/lib/BellSimple';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRight';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api } from '$lib/api';
  import { describeNotification, notificationVisual, type NotificationItem } from '$lib/notifications';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const unreadOnly = $derived(page.url.searchParams.get('unread') === '1');

  async function refresh() {
    await Promise.all([invalidate('app:notifications'), invalidate('app:viewer')]);
  }

  async function open(n: NotificationItem) {
    if (!n.readAt) {
      await api.post('/api/me/notifications/read', { ids: [n.id] });
      await refresh();
    }
    const { href } = describeNotification(n);
    if (href) await goto(href);
  }

  // Günlere göre gruplar: Bugün, Dün, Bu hafta, Daha eski
  const groups = $derived.by(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const today = start.getTime();
    const DAY = 86_400_000;
    const label = (at: number) => (at >= today ? t('Bugün') : at >= today - DAY ? t('Dün') : at >= today - 6 * DAY ? t('Bu hafta') : t('Daha eski'));
    const out: { label: string; items: NotificationItem[] }[] = [];
    for (const n of data.notifications.items) {
      const l = label(n.createdAt);
      if (out.at(-1)?.label !== l) out.push({ label: l, items: [] });
      out.at(-1)!.items.push(n);
    }
    return out;
  });
  const unreadOnPage = $derived(data.notifications.items.filter((n) => !n.readAt).length);

  async function markAll() {
    await api.post('/api/me/notifications/read', { ids: 'all' });
    await refresh();
  }

  async function remove(n: NotificationItem) {
    await api.delete(`/api/me/notifications/${n.id}`);
    await refresh();
  }
</script>

<PageHeader title={t('Bildirimler')} description={t('Yanıtlar, alıntılar, tepkiler ve hesabınla ilgili her şey.')}>
  {#snippet actions()}
    <div class="flex rounded-lg border bg-card p-0.5 text-sm" role="tablist">
      <a href="/notifications" role="tab" aria-selected={!unreadOnly} class={cn('rounded-md px-3 py-1 font-medium', !unreadOnly ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}>{t('Tümü')}</a>
      <a href="/notifications?unread=1" role="tab" aria-selected={unreadOnly} class={cn('rounded-md px-3 py-1 font-medium', unreadOnly ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}>{t('Okunmamış')}</a>
    </div>
    <Button variant="outline" size="sm" onclick={markAll} disabled={!unreadOnPage && !unreadOnly}><ChecksIcon />{t('Tümünü okundu say')}</Button>
    <Button href="/settings/notifications" variant="ghost" size="icon-sm" title={t('Tercihler')} aria-label={t('Tercihler')}><GearIcon /></Button>
  {/snippet}
</PageHeader>

{#if !data.notifications.items.length}
  <EmptyState icon={BellIcon} title={unreadOnly ? t('Okunmamış bildirim yok') : t('Bildirim yok')} description={t('Yeni bir şey olduğunda burada göreceksiniz.')} />
{:else}
  <div class="grid gap-5" data-part="notifications">
    {#each groups as g (g.label)}
      <section>
        <h2 class="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</h2>
        <div class="overflow-hidden rounded-xl border bg-card shadow-card">
          {#each g.items as n (n.id)}
            {@const v = notificationVisual(n)}
            {@const d = describeNotification(n)}
            <div class={cn('group relative flex items-center gap-3 border-b px-3 py-3 transition-colors last:border-b-0 hover:bg-row-hover sm:px-4', !n.readAt && 'bg-primary/[0.04]')} data-unread={!n.readAt || undefined}>
              {#if !n.readAt}<span class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden="true"></span>{/if}
              <span class="flex size-10 shrink-0 items-center justify-center rounded-xl" style="background:color-mix(in oklch, {v.color} 15%, transparent);color:{v.color}">
                <v.icon class="size-5" weight="duotone" />
              </span>
              <button type="button" class="grid min-w-0 flex-1 gap-0.5 text-left" onclick={() => open(n)}>
                <span class={cn('text-sm leading-snug', n.readAt ? 'text-muted-foreground' : 'font-medium text-foreground')}>{d.text}</span>
                <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <TimeAgo ms={n.createdAt} />{#if !n.readAt}<span class="size-1.5 rounded-full bg-primary"></span><span class="text-primary">{t('Yeni')}</span>{/if}
                </span>
              </button>
              <Button variant="ghost" size="icon-sm" class="text-muted-foreground opacity-60 group-hover:opacity-100" onclick={() => remove(n)} aria-label={t('Sil')} title={t('Sil')}><TrashIcon /></Button>
              {#if d.href}<CaretRightIcon class="size-4 shrink-0 text-muted-foreground/60 max-sm:hidden" />{/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>
  <Pagination page={data.notifications.page} perPage={data.notifications.perPage} total={data.notifications.total} />
{/if}
