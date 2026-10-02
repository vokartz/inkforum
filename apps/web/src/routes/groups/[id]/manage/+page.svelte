<script lang="ts">
  import type { UserSummary } from '@forum/shared';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import XIcon from 'phosphor-svelte/lib/X';
  import UserMinusIcon from 'phosphor-svelte/lib/UserMinus';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import UserPicker from '$lib/components/UserPicker.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Field from '$lib/components/Field.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction, promptAction } from '$lib/confirm.svelte';
  import { formatDate, fromLocalInput } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const g = $derived(data.group);
  let picked = $state<UserSummary | null>(null);
  let expires = $state('');

  async function run(fn: () => Promise<unknown>, success: string) {
    try {
      await fn();
      toast.success(success);
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function handle(id: number, approve: boolean) {
    let response: string | null = null;
    if (!approve) {
      const reason = await promptAction({
        title: t('Katılım isteği reddedilsin mi?'),
        description: t('Gerekçe yazarsan üyeye bildirimle iletilir.'),
        input: { label: t('Gerekçe (isteğe bağlı)'), multiline: true },
        confirmLabel: t('Reddet'),
        destructive: true,
      });
      if (reason === null) return;
      response = reason || null;
    }
    await run(() => api.post(`/api/groups/requests/${id}`, { approve, response }), approve ? t('İstek onaylandı.') : t('İstek reddedildi.'));
  }

  async function add() {
    if (!picked) return;
    const user = picked;
    await run(
      () => api.post(`/api/groups/${g.id}/members`, { userId: user.id, expiresAt: fromLocalInput(expires) }),
      t('{name} gruba eklendi.', { name: user.displayName }),
    );
    picked = null;
    expires = '';
  }

  async function remove(user: UserSummary) {
    if (!(await confirmAction({ title: t('{name} gruptan çıkarılsın mı?', { name: user.displayName }), confirmLabel: t('Çıkar'), destructive: true }))) return;
    await run(() => api.delete(`/api/groups/${g.id}/members/${user.id}`), t('Üye gruptan çıkarıldı.'));
  }
</script>

<PageHeader title={t('{name} — Yönetim', { name: tc(g.name) })} description={t('Katılım isteklerini yanıtlayın ve üyeleri yönetin.')}>
  {#snippet actions()}<Button href="/groups/{g.id}" variant="outline" size="sm">{t('Gruba dön')}</Button>{/snippet}
</PageHeader>

<div class="grid gap-6 lg:grid-cols-2">
  <Card.Root>
    <Card.Header>
      <Card.Title class="text-base">{t('Bekleyen istekler ({n})', { n: data.requests.length })}</Card.Title>
    </Card.Header>
    <Card.Content class="grid gap-3">
      {#if !data.requests.length}
        <p class="text-sm text-muted-foreground">{t('Bekleyen istek yok.')}</p>
      {:else}
        {#each data.requests as r (r.id)}
          <div class="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div class="grid min-w-0 gap-0.5">
              <UserName user={r.user} avatar avatarSize={22} />
              {#if r.reason}<p class="text-sm">{r.reason}</p>{/if}
              <span class="text-xs text-muted-foreground"><TimeAgo ms={r.createdAt} /></span>
            </div>
            <div class="flex gap-1">
              <Button size="icon-sm" onclick={() => handle(r.id, true)} aria-label={t('Onayla')}><CheckIcon /></Button>
              <Button size="icon-sm" variant="destructive" onclick={() => handle(r.id, false)} aria-label={t('Reddet')}><XIcon /></Button>
            </div>
          </div>
        {/each}
      {/if}
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header><Card.Title class="text-base">{t('Üye ekle')}</Card.Title></Card.Header>
    <Card.Content class="grid gap-3">
      {#if picked}
        <div class="flex items-center justify-between rounded-lg border p-2">
          <UserName user={picked} avatar link={false} />
          <Button variant="ghost" size="xs" onclick={() => (picked = null)}>{t('Değiştir')}</Button>
        </div>
      {:else}
        <UserPicker onpick={(u) => (picked = u)} />
      {/if}
      <Field label={t('Üyelik bitişi')} for="expires" hint={t('Boş bırakılırsa süresiz.')}>
        <Input id="expires" type="datetime-local" bind:value={expires} />
      </Field>
      <Button disabled={!picked} onclick={add}>{t('Gruba ekle')}</Button>
    </Card.Content>
  </Card.Root>
</div>

<h2 class="mt-8 mb-3 text-lg font-semibold">{t('Üyeler')}</h2>
{#if !data.members.items.length}
  <EmptyState title={t('Grupta üye yok')} />
{:else}
  <div class="grid gap-2">
    {#each data.members.items as m (m.user.id)}
      <div class="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
        <div class="grid">
          <UserName user={m.user} avatar avatarSize={24} />
          <span class="text-xs text-muted-foreground">
            {m.isPrimary ? t('Ana grup') : t('Ek grup')}{#if m.expiresAt} · {t('{date} tarihine kadar', { date: formatDate(m.expiresAt) })}{/if}
          </span>
        </div>
        <Button variant="ghost" size="sm" onclick={() => remove(m.user)}><UserMinusIcon />{t('Çıkar')}</Button>
      </div>
    {/each}
  </div>
  <Pagination page={data.members.page} perPage={data.members.perPage} total={data.members.total} />
{/if}
