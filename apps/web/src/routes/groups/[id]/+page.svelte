<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import SettingsIcon from 'phosphor-svelte/lib/GearSix';
  import * as Card from '$lib/components/ui/card';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GroupBadge from '$lib/components/GroupBadge.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { can } from '$lib/viewer';
  import { formatDate, formatNumber } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const g = $derived(data.group);
  let requestOpen = $state(false);
  let reason = $state('');
  let busy = $state(false);

  const canJoin = $derived(
    !!data.viewer.user && can(data.viewer, 'groups.join') && g.kind === 'regular' && !g.isMember && !g.isProtected && g.joinType !== 'closed',
  );
  const canLeave = $derived(!!data.viewer.user && g.isMember && g.kind === 'regular' && !g.isProtected && g.joinType !== 'closed');

  async function run(fn: () => Promise<unknown>, success: string) {
    busy = true;
    try {
      await fn();
      toast.success(success);
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      busy = false;
    }
  }

  async function join() {
    if (g.joinType === 'requestable') {
      requestOpen = true;
      return;
    }
    await run(() => api.post(`/api/groups/${g.id}/join`), t('{name} grubuna katıldınız.', { name: tc(g.name) }));
  }

  async function sendRequest() {
    requestOpen = false;
    await run(() => api.post(`/api/groups/${g.id}/join`, { reason }), t('Katılım isteğiniz gönderildi.'));
    reason = '';
  }

  async function leave() {
    if (!(await confirmAction({ title: t('{name} grubundan ayrılmak istiyor musunuz?', { name: tc(g.name) }), confirmLabel: t('Ayrıl'), destructive: true }))) return;
    await run(() => api.post(`/api/groups/${g.id}/leave`), t('Gruptan ayrıldınız.'));
  }

  async function makePrimary() {
    await run(() => api.post('/api/me/groups/primary', { groupId: g.id }), t('Ana grubunuz güncellendi.'));
  }
</script>

<PageHeader title={tc(g.name)} description={tc(g.description) || null}>
  <div class="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
    <GroupBadge group={{ id: g.id, name: g.name, color: g.color, iconUrl: g.iconUrl, iconCount: g.iconCount }} />
    <span>{t('{n} üye', { n: formatNumber(g.memberCount) })}</span>
    {#if g.kind === 'post_count'}<span>· {t('{n} mesajda otomatik', { n: formatNumber(g.minPosts) })}</span>{/if}
    {#if g.require2fa}<span>· {t('İki adımlı doğrulama zorunlu')}</span>{/if}
  </div>
  {#snippet actions()}
    {#if g.canManage && g.kind === 'regular'}
      <Button href="/groups/{g.id}/manage" variant="outline" size="sm"><SettingsIcon />{t('Grubu yönet')}</Button>
    {/if}
    {#if g.hasPendingRequest}
      <Button variant="outline" size="sm" disabled={busy} onclick={() => run(() => api.delete(`/api/groups/${g.id}/request`), t('İsteğiniz geri çekildi.'))}
        >{t('İsteği geri çek')}</Button
      >
    {:else if canJoin}
      <Button size="sm" disabled={busy} onclick={join}>{g.joinType === 'free' ? t('Gruba katıl') : t('Katılım isteği gönder')}</Button>
    {/if}
    {#if g.isMember && !g.isPrimary && g.kind === 'regular' && g.visibility !== 'additional_only' && !g.isProtected}
      <Button variant="outline" size="sm" disabled={busy} onclick={makePrimary}>{t('Ana grubum yap')}</Button>
    {/if}
    {#if canLeave}
      <Button variant="ghost" size="sm" disabled={busy} onclick={leave}>{t('Ayrıl')}</Button>
    {/if}
  {/snippet}
</PageHeader>

<div class="grid gap-6 lg:grid-cols-4">
  <div class="lg:col-span-3">
    {#if !data.members.items.length}
      <EmptyState title={t('Bu grupta henüz üye yok')} />
    {:else}
      <div class="grid gap-2 sm:grid-cols-2">
        {#each data.members.items as m (m.user.id)}
          <div class="flex items-center gap-3 rounded-xl border bg-card p-3">
            <UserAvatar user={m.user} size={38} />
            <div class="grid min-w-0">
              <UserName user={m.user} />
              <span class="text-xs text-muted-foreground">
                {m.isPrimary ? t('Ana grup') : t('Ek grup')} · {formatDate(m.addedAt)}
                {#if m.expiresAt} · {t('{date} tarihine kadar', { date: formatDate(m.expiresAt) })}{/if}
              </span>
            </div>
          </div>
        {/each}
      </div>
      <Pagination page={data.members.page} perPage={data.members.perPage} total={data.members.total} />
    {/if}
  </div>
  {#if g.moderators.length}
    <Card.Root class="h-fit">
      <Card.Header><Card.Title class="text-base">{t('Grup liderleri')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-2">
        {#each g.moderators as mod (mod.id)}<UserName user={mod} avatar avatarSize={24} />{/each}
      </Card.Content>
    </Card.Root>
  {/if}
</div>

<Dialog.Root bind:open={requestOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{t('{name} grubuna katılım isteği', { name: tc(g.name) })}</Dialog.Title>
      <Dialog.Description>{t('Grup liderleri isteğinizi inceleyecek. İsterseniz kısa bir not ekleyin.')}</Dialog.Description>
    </Dialog.Header>
    <Textarea bind:value={reason} rows={3} maxlength={500} placeholder={t('Neden katılmak istiyorsunuz? (isteğe bağlı)')} />
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (requestOpen = false)}>{t('Vazgeç')}</Button>
      <Button onclick={sendRequest}>{t('İsteği gönder')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
