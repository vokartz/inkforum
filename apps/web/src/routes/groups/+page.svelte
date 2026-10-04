<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import type { GroupsPageGroup, GroupsPageMember, Paginated } from '@forum/shared';
  import CrownIcon from 'phosphor-svelte/lib/Crown';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import SettingsIcon from 'phosphor-svelte/lib/GearSix';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { can } from '$lib/viewer';
  import { formatNumber } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';
  import type { GroupMember } from './[id]/+page';

  let { data } = $props();
  const p = $derived(data.page);

  const joinLabel: Record<string, string> = { free: 'Herkes katılabilir', requestable: 'İstekle katılım', closed: 'Kapalı grup' };

  let extra = $state<Record<number, GroupsPageMember[]>>({});
  let loadingMore = $state<number | null>(null);
  let busy = $state(false);
  let requestFor = $state<GroupsPageGroup | null>(null);
  let reason = $state('');

  function membersOf(g: GroupsPageGroup): GroupsPageMember[] {
    return [...g.members, ...(extra[g.id] ?? [])];
  }

  function meta(g: GroupsPageGroup): string | null {
    if (g.kind === 'post_count') return t('{n} mesajda otomatik', { n: formatNumber(g.minPosts) });
    if (g.kind === 'regular' && !g.isProtected && joinLabel[g.joinType]) return t(joinLabel[g.joinType]!);
    return null;
  }

  async function loadMore(g: GroupsPageGroup) {
    loadingMore = g.id;
    try {
      const shown = membersOf(g).length;
      const page = Math.floor(shown / p.memberLimit) + 1;
      const res = await api.get<Paginated<GroupMember>>(`/api/groups/${g.id}/members?page=${page}&perPage=${p.memberLimit}`);
      const known = new Set(membersOf(g).map((m) => m.user.id));
      extra[g.id] = [...(extra[g.id] ?? []), ...res.items.filter((m) => !known.has(m.user.id)).map((m) => ({ user: m.user, isLeader: false }))];
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      loadingMore = null;
    }
  }

  function canJoin(g: GroupsPageGroup): boolean {
    return !!data.viewer.user && can(data.viewer, 'groups.join') && g.kind === 'regular' && !g.isMember && !g.isProtected && g.joinType !== 'closed';
  }

  function canLeave(g: GroupsPageGroup): boolean {
    return !!data.viewer.user && g.isMember && g.kind === 'regular' && !g.isProtected && g.joinType !== 'closed';
  }

  async function run(fn: () => Promise<unknown>, success: string) {
    busy = true;
    try {
      await fn();
      toast.success(success);
      extra = {};
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      busy = false;
    }
  }

  async function join(g: GroupsPageGroup) {
    if (g.joinType === 'requestable') {
      reason = '';
      requestFor = g;
      return;
    }
    await run(() => api.post(`/api/groups/${g.id}/join`), t('{name} grubuna katıldınız.', { name: tc(g.name) }));
  }

  async function sendRequest() {
    const g = requestFor;
    requestFor = null;
    if (!g) return;
    await run(() => api.post(`/api/groups/${g.id}/join`, { reason }), t('Katılım isteğiniz gönderildi.'));
  }

  async function leave(g: GroupsPageGroup) {
    if (!(await confirmAction({ title: t('{name} grubundan ayrılmak istiyor musunuz?', { name: tc(g.name) }), confirmLabel: t('Ayrıl'), destructive: true }))) return;
    await run(() => api.post(`/api/groups/${g.id}/leave`), t('Gruptan ayrıldınız.'));
  }
</script>

<PageHeader title={t('Gruplar')} description={t('Topluluğu yöneten ekip ve üye grupları.')} />

{#if !p.groups.length}
  <EmptyState title={t('Gösterilecek grup yok')} />
{:else}
  <div class="grid gap-12">
    {#each p.groups as g (g.id)}
      {@const members = membersOf(g)}
      {@const info = meta(g)}
      <section id="group-{g.id}" class="scroll-mt-24">
        <div class="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b pb-4">
          <div class="grid min-w-0 gap-1">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 class="text-lg font-semibold tracking-tight">{tc(g.name)}</h2>
              <span class="text-sm text-muted-foreground tabular-nums">{t('{n} üye', { n: formatNumber(g.memberCount) })}</span>
              {#if g.isMember}
                <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"><CheckIcon class="size-3" />{t('Üyesiniz')}</span>
              {/if}
            </div>
            {#if g.description}<p class="max-w-2xl text-sm text-muted-foreground">{tc(g.description)}</p>{/if}
            {#if info || g.hasPendingRequest}
              <p class="text-xs text-muted-foreground">
                {[info, g.hasPendingRequest ? t('İsteğiniz bekliyor') : null].filter(Boolean).join(' · ')}
              </p>
            {/if}
          </div>
          <div class="flex flex-wrap gap-2">
            {#if g.canManage && g.kind === 'regular'}
              <Button href="/groups/{g.id}/manage" variant="outline" size="sm"><SettingsIcon />{t('Grubu yönet')}</Button>
            {/if}
            {#if g.hasPendingRequest}
              <Button variant="outline" size="sm" disabled={busy} onclick={() => run(() => api.delete(`/api/groups/${g.id}/request`), t('İsteğiniz geri çekildi.'))}
                >{t('İsteği geri çek')}</Button
              >
            {:else if canJoin(g)}
              <Button size="sm" disabled={busy} onclick={() => join(g)}>{g.joinType === 'free' ? t('Gruba katıl') : t('Katılım isteği gönder')}</Button>
            {/if}
            {#if g.canSetPrimary && !g.isPrimary}
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onclick={() => run(() => api.post('/api/me/groups/primary', { groupId: g.id }), t('Ana grubunuz güncellendi.'))}>{t('Ana grubum yap')}</Button
              >
            {/if}
            {#if canLeave(g)}
              <Button variant="ghost" size="sm" disabled={busy} onclick={() => leave(g)}>{t('Ayrıl')}</Button>
            {/if}
          </div>
        </div>

        {#if p.showMembers}
          {#if !members.length}
            <p class="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t('Bu grupta henüz üye yok')}</p>
          {:else}
            <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {#each members as m (m.user.id)}
                <li class="flex min-w-0 flex-col items-center gap-2.5 rounded-xl border bg-card px-3 py-5 text-center">
                  <UserAvatar user={m.user} size={56} />
                  <div class="grid w-full min-w-0 gap-0.5">
                    <div class="flex min-w-0 justify-center"><UserName user={m.user} class="max-w-full text-sm" /></div>
                    {#if m.isLeader}
                      <span class="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground"><CrownIcon class="size-3" weight="fill" />{t('Grup lideri')}</span>
                    {:else if m.user.customTitle}
                      <span class="truncate text-xs text-muted-foreground">{m.user.customTitle}</span>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
            {#if members.length < g.memberCount}
              <div class="mt-4 flex justify-center">
                <Button variant="outline" size="sm" disabled={loadingMore === g.id} onclick={() => loadMore(g)}
                  >{t('Daha fazla göster ({n} kaldı)', { n: formatNumber(g.memberCount - members.length) })}</Button
                >
              </div>
            {/if}
          {/if}
        {/if}
      </section>
    {/each}
  </div>
{/if}

<Dialog.Root open={!!requestFor} onOpenChange={(o) => !o && (requestFor = null)}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{t('{name} grubuna katılım isteği', { name: tc(requestFor?.name ?? '') })}</Dialog.Title>
      <Dialog.Description>{t('Grup liderleri isteğinizi inceleyecek. İsterseniz kısa bir not ekleyin.')}</Dialog.Description>
    </Dialog.Header>
    <Textarea bind:value={reason} rows={3} maxlength={500} placeholder={t('Neden katılmak istiyorsunuz? (isteğe bağlı)')} />
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (requestFor = null)}>{t('Vazgeç')}</Button>
      <Button onclick={sendRequest}>{t('İsteği gönder')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
