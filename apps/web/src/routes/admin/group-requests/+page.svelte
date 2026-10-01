<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Tray';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api, errorMessage } from '$lib/api';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();

  async function handle(id: number, approve: boolean) {
    try {
      await api.post(`/api/admin/group-requests/${id}`, { approve });
      toast.success(approve ? t('İstek onaylandı.') : t('İstek reddedildi.'));
      await invalidate('app:admin-requests');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<PageHeader icon={PageHeaderIcon} title={t('Grup katılım istekleri')} description={t('Tüm gruplardaki bekleyen istekler.')} />

{#if !data.requests.length}
  <EmptyState title={t('Bekleyen istek yok')} />
{:else}
  <div class="grid gap-2">
    {#each data.requests as r (r.id)}
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm">
        <div class="grid gap-0.5">
          <span><UserName user={r.user} /> → <a href="/admin/groups/{r.groupId}" class="font-medium hover:underline">{r.groupName}</a></span>
          {#if r.reason}<span class="text-muted-foreground">{r.reason}</span>{/if}
          <span class="text-xs text-muted-foreground"><TimeAgo ms={r.createdAt} /></span>
        </div>
        <div class="flex gap-1">
          <Button size="sm" onclick={() => handle(r.id, true)}>{t('Onayla')}</Button>
          <Button size="sm" variant="destructive" onclick={() => handle(r.id, false)}>{t('Reddet')}</Button>
        </div>
      </div>
    {/each}
  </div>
{/if}
