<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GroupBadge from '$lib/components/GroupBadge.svelte';
  import { api, errorMessage } from '$lib/api';
  import { formatDate } from '$lib/format';
  import { t } from '$lib/i18n.svelte';
  import type { GroupDto } from '$lib/types';

  let { data } = $props();
  const g = $derived(data.groups);
  const badge = (x: GroupDto) => ({ id: x.id, name: x.name, color: x.color, iconUrl: x.iconUrl, iconCount: x.iconCount });

  async function run(fn: () => Promise<unknown>, success: string) {
    try {
      await fn();
      toast.success(success);
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<PageHeader title={t('Gruplarım')} description={t('Ana grubunuz isminizin rengini ve rozetinizi belirler.')} />

<div class="grid gap-6">
  <Card.Root>
    <Card.Header><Card.Title class="text-base">{t('Ana grup')}</Card.Title></Card.Header>
    <Card.Content class="flex flex-wrap items-center gap-3 text-sm">
      {#if g.primary}
        <GroupBadge group={badge(g.primary)} href="/groups/{g.primary.id}" />
        {#if g.primaryExpiresAt}<span class="text-muted-foreground">{t('{date} tarihine kadar', { date: formatDate(g.primaryExpiresAt) })}</span>{/if}
        {#if !g.primary.isProtected}
          <Button variant="ghost" size="sm" onclick={() => run(() => api.post('/api/me/groups/primary', { groupId: null }), t('Ana grup kaldırıldı.'))}
            >{t('Ana grubu kaldır')}</Button
          >
        {/if}
      {:else}
        <span class="text-muted-foreground">{t('Ana grubunuz yok; rütbeniz gösterilir.')}</span>
      {/if}
      {#if g.postGroup}<span class="text-muted-foreground">{t('Rütbe:')}</span><GroupBadge group={badge(g.postGroup)} />{/if}
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header><Card.Title class="text-base">{t('Ek gruplar')}</Card.Title></Card.Header>
    <Card.Content class="grid gap-2">
      {#if !g.additional.length}
        <p class="text-sm text-muted-foreground">{t('Ek grubunuz yok.')}</p>
      {:else}
        {#each g.additional as m (m.group.id)}
          <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <div class="flex items-center gap-2 text-sm">
              <GroupBadge group={badge(m.group)} href="/groups/{m.group.id}" />
              {#if m.expiresAt}<span class="text-xs text-muted-foreground">{t('{date} tarihine kadar', { date: formatDate(m.expiresAt) })}</span>{/if}
            </div>
            <div class="flex gap-1">
              {#if m.group.visibility !== 'additional_only' && !m.group.isProtected}
                <Button variant="outline" size="xs" onclick={() => run(() => api.post('/api/me/groups/primary', { groupId: m.group.id }), t('Ana grubunuz güncellendi.'))}
                  >{t('Ana grup yap')}</Button
                >
              {/if}
              {#if m.group.joinType !== 'closed' && !m.group.isProtected}
                <Button variant="ghost" size="xs" onclick={() => run(() => api.post(`/api/groups/${m.group.id}/leave`), t('Gruptan ayrıldınız.'))}
                  >{t('Ayrıl')}</Button
                >
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </Card.Content>
  </Card.Root>

  {#if g.joinable.length}
    <Card.Root>
      <Card.Header>
        <Card.Title class="text-base">{t('Katılabileceğiniz gruplar')}</Card.Title>
      </Card.Header>
      <Card.Content class="grid gap-2">
        {#each g.joinable as j (j.id)}
          <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <div class="grid gap-0.5">
              <GroupBadge group={badge(j)} href="/groups/{j.id}" />
              {#if j.description}<span class="text-xs text-muted-foreground">{j.description}</span>{/if}
            </div>
            {#if j.hasPendingRequest}
              <span class="text-xs text-warning">{t('İstek bekliyor')}</span>
            {:else}
              <Button href="/groups/{j.id}" size="xs" variant="outline">{j.joinType === 'free' ? t('Katıl') : t('İstek gönder')}</Button>
            {/if}
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  {/if}
</div>
