<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Users';
  import { page } from '$app/state';
  import { goto, invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import XIcon from 'phosphor-svelte/lib/X';
  import * as Table from '$lib/components/ui/table';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDate, formatNumber } from '$lib/format';
  import { can } from '$lib/viewer';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();

  let q = $state(page.url.searchParams.get('q') ?? '');
  const status = $derived(page.url.searchParams.get('status') ?? 'all');
  let group = $state(page.url.searchParams.get('group') ?? '');
  let sort = $state(page.url.searchParams.get('sort') ?? 'registered');

  function go(patch: Record<string, string | null>) {
    const params = new URLSearchParams(page.url.searchParams);
    params.delete('page');
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    goto(`/admin/users${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true });
  }

  let timer: ReturnType<typeof setTimeout>;
  const tabs = [
    { key: 'all', label: 'Tümü' },
    { key: 'active', label: 'Etkin' },
    { key: 'pending_approval', label: 'Onay bekleyen' },
    { key: 'pending_email', label: 'E-posta bekleyen' },
    { key: 'deactivated', label: 'Devre dışı' },
  ];

  async function approve(id: number, name: string) {
    try {
      await api.post(`/api/admin/users/${id}/approve`);
      toast.success(t('{name} onaylandı.', { name }));
      await invalidate('app:admin-users');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function reject(id: number, name: string) {
    if (!(await confirmAction({ title: t('{name} reddedilsin mi?', { name }), description: t('Başvuru silinir ve üyeye e-posta gönderilir.'), confirmLabel: t('Reddet'), destructive: true })))
      return;
    try {
      await api.post(`/api/admin/users/${id}/reject`, { reason: null });
      toast.success(t('Başvuru reddedildi.'));
      await invalidate('app:admin-users');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<PageHeader icon={PageHeaderIcon} title={t('Üyeler')} description={data.list ? t('{n} sonuç', { n: formatNumber(data.list.total) }) : null} />

{#if data.list}
  <div class="mb-4 flex flex-wrap gap-1 border-b">
    {#each tabs as tab (tab.key)}
      <button
        type="button"
        onclick={() => go({ status: tab.key === 'all' ? null : tab.key })}
        class="-mb-px border-b-2 px-3 py-2 text-sm {status === tab.key ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}"
      >
        {t(tab.label)}
        {#if tab.key !== 'all' && data.list.counts[tab.key]}<span class="ml-1 rounded-full bg-muted px-1.5 text-xs">{data.list.counts[tab.key]}</span>{/if}
      </button>
    {/each}
  </div>

  <div class="mb-4 flex flex-wrap gap-2">
    <div class="relative min-w-60 flex-1">
      <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        bind:value={q}
        oninput={() => {
          clearTimeout(timer);
          timer = setTimeout(() => go({ q: q.trim() || null }), 350);
        }}
        placeholder={t('İsim, e-posta, ID veya IP…')}
        class="pl-8"
      />
    </div>
    <NativeSelect
      bind:value={group}
      onchange={() => go({ group: group || null })}
      class="w-48"
      options={[{ value: '', label: t('Tüm gruplar') }, ...data.groups.filter((g) => g.systemKey !== 'guest').map((g) => ({ value: String(g.id), label: g.name }))]}
    />
    <NativeSelect
      bind:value={sort}
      onchange={() => go({ sort })}
      class="w-44"
      options={[
        { value: 'registered', label: t('Kayıt tarihi') },
        { value: 'name', label: t('Kullanıcı adı') },
        { value: 'active', label: t('Son etkinlik') },
        { value: 'posts', label: t('Mesaj') },
        { value: 'warnings', label: t('Uyarı puanı') },
      ]}
    />
  </div>

  {#if !data.list.items.length}
    <EmptyState title={t('Üye bulunamadı')} />
  {:else}
    <div class="overflow-hidden rounded-xl border bg-card">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>{t('Üye')}</Table.Head>
            <Table.Head class="hidden md:table-cell">{t('E-posta')}</Table.Head>
            <Table.Head>{t('Durum')}</Table.Head>
            <Table.Head class="hidden lg:table-cell">{t('Kayıt')}</Table.Head>
            <Table.Head class="hidden lg:table-cell">{t('Son etkinlik')}</Table.Head>
            <Table.Head class="hidden text-right sm:table-cell">{t('Uyarı')}</Table.Head>
            <Table.Head></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.list.items as r (r.user.id)}
            <Table.Row>
              <Table.Cell>
                <a href="/admin/users/{r.user.id}" class="flex items-center gap-3">
                  <UserAvatar user={r.user} size={36} />
                  <span class="grid leading-tight">
                    <UserName user={r.user} link={false} class="font-semibold" />
                    <span class="text-xs text-muted-foreground">#{r.user.id} · @{r.user.username}</span>
                  </span>
                </a>
              </Table.Cell>
              <Table.Cell class="hidden md:table-cell">
                <span class="text-sm">{r.email}</span>
                {#if !r.emailVerified}<span class="ml-1 text-xs text-muted-foreground">{t('(doğrulanmadı)')}</span>{/if}
              </Table.Cell>
              <Table.Cell><StatusBadge status={r.status} /></Table.Cell>
              <Table.Cell class="hidden text-muted-foreground lg:table-cell">{formatDate(r.registeredAt)}</Table.Cell>
              <Table.Cell class="hidden text-muted-foreground lg:table-cell"><TimeAgo ms={r.lastActiveAt} /></Table.Cell>
              <Table.Cell class="hidden text-right tabular-nums sm:table-cell {r.warningPoints ? 'text-destructive' : 'text-muted-foreground'}"
                >{r.warningPoints}</Table.Cell
              >
              <Table.Cell class="text-right">
                <div class="flex justify-end gap-1">
                  {#if r.status === 'pending_approval' && can(data.viewer, 'admin.users.approve')}
                    <Button size="icon-sm" onclick={() => approve(r.user.id, r.user.displayName)} aria-label={t('Onayla')}><CheckIcon /></Button>
                    <Button size="icon-sm" variant="destructive" onclick={() => reject(r.user.id, r.user.displayName)} aria-label={t('Reddet')}><XIcon /></Button>
                  {/if}
                  <Button href="/admin/users/{r.user.id}" size="sm" variant="outline">{t('Yönet')}</Button>
                </div>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
    <Pagination page={data.list.page} perPage={data.list.perPage} total={data.list.total} />
  {/if}
{/if}
