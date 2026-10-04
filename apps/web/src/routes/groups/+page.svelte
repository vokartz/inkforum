<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { EXTENSION_PERMISSION_CATEGORY, PERMISSION_CATEGORIES, type GroupsPageGroup, type GroupsPageMember, type Paginated } from '@forum/shared';
  import UsersIcon from 'phosphor-svelte/lib/Users';
  import LockIcon from 'phosphor-svelte/lib/Lock';
  import DoorOpenIcon from 'phosphor-svelte/lib/DoorOpen';
  import SendIcon from 'phosphor-svelte/lib/PaperPlaneRight';
  import CrownIcon from 'phosphor-svelte/lib/Crown';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import SettingsIcon from 'phosphor-svelte/lib/GearSix';
  import KeyIcon from 'phosphor-svelte/lib/Key';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GroupBadge from '$lib/components/GroupBadge.svelte';
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

  const CATEGORIES = [...PERMISSION_CATEGORIES, EXTENSION_PERMISSION_CATEGORY];
  const joinLabel: Record<string, string> = { free: 'Herkes katılabilir', requestable: 'İstekle katılım', closed: 'Kapalı grup' };

  let extra = $state<Record<number, GroupsPageMember[]>>({});
  let loadingMore = $state<number | null>(null);
  let busy = $state(false);
  let requestFor = $state<GroupsPageGroup | null>(null);
  let reason = $state('');

  function membersOf(g: GroupsPageGroup): GroupsPageMember[] {
    return [...g.members, ...(extra[g.id] ?? [])];
  }

  function permissionGroups(g: GroupsPageGroup) {
    return CATEGORIES.map((c) => ({ ...c, items: g.permissions.filter((x) => x.category === c.key) })).filter((c) => c.items.length);
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

<PageHeader title={t('Gruplar')} description={t('Topluluktaki roller, üyeleri ve sahip oldukları yetkiler.')} />

{#if !p.groups.length}
  <EmptyState title={t('Gösterilecek grup yok')} />
{:else}
  <nav class="mb-6 flex flex-wrap gap-2" aria-label={t('Gruplar')}>
    {#each p.groups as g (g.id)}
      <a href="#group-{g.id}" class="rounded-full border bg-card px-3 py-1 text-sm transition-colors hover:border-primary/40" style:color={g.color ?? undefined}>{tc(g.name)}</a>
    {/each}
  </nav>

  <div class="grid gap-6">
    {#each p.groups as g (g.id)}
      {@const members = membersOf(g)}
      {@const perms = permissionGroups(g)}
      <section id="group-{g.id}" class="scroll-mt-24 overflow-hidden rounded-2xl border bg-card" style:border-top-color={g.color ?? undefined} style:border-top-width={g.color ? '3px' : undefined}>
        <header class="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-5">
          <div class="grid min-w-0 gap-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <GroupBadge group={{ id: g.id, name: g.name, color: g.color, iconUrl: g.iconUrl, iconCount: g.iconCount }} />
              {#if g.isMember}<span class="inline-flex items-center gap-1 text-xs font-medium text-success"><CheckIcon class="size-3.5" />{t('Üyesiniz')}</span>{/if}
            </div>
            {#if g.description}<p class="text-sm text-muted-foreground">{tc(g.description)}</p>{/if}
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span class="inline-flex items-center gap-1"><UsersIcon class="size-3.5" />{t('{n} üye', { n: formatNumber(g.memberCount) })}</span>
              {#if g.kind === 'post_count'}
                <span>{t('{n} mesajda otomatik', { n: formatNumber(g.minPosts) })}</span>
              {:else if g.kind === 'regular' && !g.isProtected}
                <span class="inline-flex items-center gap-1">
                  {#if g.joinType === 'free'}<DoorOpenIcon class="size-3.5" />{:else if g.joinType === 'requestable'}<SendIcon class="size-3.5" />{:else}<LockIcon
                      class="size-3.5"
                    />{/if}
                  {t(joinLabel[g.joinType] ?? '')}
                </span>
              {/if}
              {#if g.hasPendingRequest}<span class="text-warning">{t('İsteğiniz bekliyor')}</span>{/if}
            </div>
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
        </header>

        {#if p.showMembers || p.showPermissions}
          <div class="grid lg:grid-cols-5">
            {#if p.showMembers}
              <div class="p-4 sm:p-5 {p.showPermissions ? 'lg:col-span-3' : 'lg:col-span-5'}">
                <h3 class="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('Üyeler')}</h3>
                {#if !members.length}
                  <p class="text-sm text-muted-foreground">{t('Bu grupta henüz üye yok')}</p>
                {:else}
                  <ul class="grid gap-2 sm:grid-cols-2 {p.showPermissions ? '' : 'lg:grid-cols-4'}">
                    {#each members as m (m.user.id)}
                      <li class="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50">
                        <UserAvatar user={m.user} size={32} />
                        <div class="min-w-0 truncate"><UserName user={m.user} /></div>
                        {#if m.isLeader}<span title={t('Grup lideri')} class="ml-auto text-warning"><CrownIcon class="size-4" weight="fill" /></span>{/if}
                      </li>
                    {/each}
                  </ul>
                  {#if members.length < g.memberCount}
                    <Button variant="ghost" size="sm" class="mt-2" disabled={loadingMore === g.id} onclick={() => loadMore(g)}
                      >{t('Daha fazla göster ({n} kaldı)', { n: formatNumber(g.memberCount - members.length) })}</Button
                    >
                  {/if}
                {/if}
              </div>
            {/if}
            {#if p.showPermissions}
              <div class="border-t bg-muted/20 p-4 sm:p-5 lg:border-t-0 {p.showMembers ? 'lg:col-span-2 lg:border-l' : 'lg:col-span-5'}">
                <h3 class="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <KeyIcon class="size-3.5" />{t('Yetkiler')}
                </h3>
                {#if g.allPermissions}
                  <p class="text-sm">{t('Bu grup tüm yetkilere sahiptir.')}</p>
                {:else if !perms.length}
                  <p class="text-sm text-muted-foreground">{t('Bu grup ek bir yetki vermiyor.')}</p>
                {:else}
                  {#if g.inheritsFrom}<p class="mb-2 text-xs text-muted-foreground">{t('{name} grubundan miras', { name: tc(g.inheritsFrom) })}</p>{/if}
                  <div class="grid gap-3">
                    {#each perms as c (c.key)}
                      <div>
                        <div class="mb-1.5 text-xs font-medium">{t(c.label)}</div>
                        <div class="flex flex-wrap gap-1.5">
                          {#each c.items as perm (perm.key)}
                            <span class="rounded-md border bg-background px-2 py-0.5 text-xs">{t(perm.label)}</span>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
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
