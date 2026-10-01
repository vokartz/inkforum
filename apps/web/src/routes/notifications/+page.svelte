<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidate } from '$app/navigation';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api } from '$lib/api';
  import { describeNotification, type NotificationItem } from '$lib/notifications';
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

  async function markAll() {
    await api.post('/api/me/notifications/read', { ids: 'all' });
    await refresh();
  }

  async function remove(n: NotificationItem) {
    await api.delete(`/api/me/notifications/${n.id}`);
    await refresh();
  }
</script>

<PageHeader title={t('Bildirimler')}>
  {#snippet actions()}
    <Button href={unreadOnly ? '/notifications' : '/notifications?unread=1'} variant="outline" size="sm">
      {unreadOnly ? t('Tümünü göster') : t('Yalnızca okunmamışlar')}
    </Button>
    <Button variant="outline" size="sm" onclick={markAll}>{t('Tümünü okundu say')}</Button>
    <Button href="/settings/notifications" variant="ghost" size="sm">{t('Tercihler')}</Button>
  {/snippet}
</PageHeader>

{#if !data.notifications.items.length}
  <EmptyState title={t('Bildirim yok')} description={t('Yeni bir şey olduğunda burada göreceksiniz.')} />
{:else}
  <div class="overflow-hidden rounded-xl border bg-card">
    {#each data.notifications.items as n (n.id)}
      <div class="flex items-start gap-3 border-b px-4 py-3 last:border-b-0 {n.readAt ? '' : 'bg-primary/5'}">
        <span class="mt-2 size-2 shrink-0 rounded-full {n.readAt ? 'bg-transparent' : 'bg-primary'}"></span>
        <button type="button" class="grid flex-1 gap-0.5 text-left" onclick={() => open(n)}>
          <span class="text-sm {n.readAt ? 'text-muted-foreground' : ''}">{describeNotification(n).text}</span>
          <TimeAgo ms={n.createdAt} class="text-xs text-muted-foreground" />
        </button>
        <Button variant="ghost" size="icon-sm" onclick={() => remove(n)} aria-label={t('Sil')}><TrashIcon /></Button>
      </div>
    {/each}
  </div>
  <Pagination page={data.notifications.page} perPage={data.notifications.perPage} total={data.notifications.total} />
{/if}
