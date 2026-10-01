<script lang="ts">
  import type { SessionInfo } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import MonitorIcon from 'phosphor-svelte/lib/Monitor';
  import SmartphoneIcon from 'phosphor-svelte/lib/DeviceMobile';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDate } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();

  const mobile = (s: SessionInfo) => /Android|iOS/.test(s.deviceLabel ?? '');

  async function revoke(s: SessionInfo) {
    try {
      await api.delete(`/api/me/sessions/${s.id}`);
      toast.success(t('Oturum kapatıldı.'));
      await invalidate('app:sessions');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function revokeOthers() {
    if (!(await confirmAction({ title: t('Diğer tüm oturumlar kapatılsın mı?'), description: t('Bu cihaz dışındaki tüm cihazlarda çıkış yapılır.'), confirmLabel: t('Kapat'), destructive: true }))) return;
    const res = await api.post<{ revoked: number }>('/api/me/sessions/revoke-others');
    toast.success(t('{n} oturum kapatıldı.', { n: res.revoked }));
    await invalidate('app:sessions');
  }
</script>

<PageHeader title={t('Oturumlar')} description={t('Hesabınıza giriş yapılmış cihazlar.')}>
  {#snippet actions()}
    {#if data.sessions.length > 1}<Button variant="outline" size="sm" onclick={revokeOthers}>{t('Diğer oturumları kapat')}</Button>{/if}
  {/snippet}
</PageHeader>

<div class="grid gap-2">
  {#each data.sessions as s (s.id)}
    <div class="flex items-center gap-4 rounded-xl border bg-card p-4">
      <div class="flex size-10 items-center justify-center rounded-lg bg-muted">
        {#if mobile(s)}<SmartphoneIcon class="size-5" />{:else}<MonitorIcon class="size-5" />{/if}
      </div>
      <div class="grid min-w-0 flex-1 gap-0.5 text-sm">
        <div class="flex items-center gap-2">
          <span class="font-medium">{s.deviceLabel ?? t('Bilinmeyen cihaz')}</span>
          {#if s.current}<span class="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">{t('Bu cihaz')}</span>{/if}
          {#if s.persistent}<span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t('Beni hatırla')}</span>{/if}
        </div>
        <span class="text-xs text-muted-foreground">
          {s.ip ?? t('IP yok')} · {t('Son etkinlik')} <TimeAgo ms={s.lastSeenAt} /> · {t('Giriş {date}', { date: formatDate(s.createdAt) })}
        </span>
      </div>
      {#if !s.current}<Button variant="ghost" size="sm" onclick={() => revoke(s)}>{t('Kapat')}</Button>{/if}
    </div>
  {/each}
</div>
