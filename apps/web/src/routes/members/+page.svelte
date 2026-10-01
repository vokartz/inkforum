<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import * as Table from '$lib/components/ui/table';
  import { Input } from '$lib/components/ui/input';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import GroupBadge from '$lib/components/GroupBadge.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { formatDate, formatNumber } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();

  let q = $state(page.url.searchParams.get('q') ?? '');
  let group = $state(page.url.searchParams.get('group') ?? '');
  let sort = $state(page.url.searchParams.get('sort') ?? 'registered');
  let dir = $state(page.url.searchParams.get('dir') ?? 'desc');

  function apply() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (group) params.set('group', group);
    if (sort !== 'registered') params.set('sort', sort);
    if (dir !== 'desc') params.set('dir', dir);
    goto(`/members${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true });
  }

  let timer: ReturnType<typeof setTimeout>;
  function onSearch() {
    clearTimeout(timer);
    timer = setTimeout(apply, 350);
  }
</script>

<PageHeader title={t('Üyeler')} description={t('{n} üye bulundu', { n: formatNumber(data.members.total) })} />

<div class="mb-4 flex flex-wrap items-end gap-2">
  <div class="relative min-w-56 flex-1">
    <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    <Input bind:value={q} oninput={onSearch} placeholder={t('İsim ile ara…')} class="pl-8" aria-label={t('Üye ara')} />
  </div>
  <NativeSelect
    bind:value={group}
    onchange={apply}
    class="w-48"
    aria-label={t('Grup')}
    options={[{ value: '', label: t('Tüm gruplar') },...data.groups.map((g) => ({ value: String(g.id), label: tc(g.name) }))]}
  />
  <NativeSelect
    bind:value={sort}
    onchange={apply}
    class="w-44"
    aria-label={t('Sıralama')}
    options={[
      { value: 'registered', label: t('Kayıt tarihi') },
      { value: 'name', label: t('İsim') },
      { value: 'posts', label: t('Mesaj sayısı') },
      { value: 'active', label: t('Son etkinlik') },
      { value: 'achievements', label: t('Başarı puanı') },
    ]}
  />
  <NativeSelect
    bind:value={dir}
    onchange={apply}
    class="w-32"
    aria-label={t('Yön')}
    options={[
      { value: 'desc', label: t('Azalan') },
      { value: 'asc', label: t('Artan') },
    ]}
  />
</div>

{#if !data.members.items.length}
  <EmptyState title={t('Üye bulunamadı')} description={t('Arama kriterlerini değiştirip tekrar deneyin.')} />
{:else}
  <div class="overflow-hidden rounded-xl border bg-card">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>{t('Üye')}</Table.Head>
          <Table.Head class="hidden md:table-cell">{t('Grup')}</Table.Head>
          <Table.Head class="hidden text-right sm:table-cell">{t('Mesaj')}</Table.Head>
          <Table.Head class="hidden text-right lg:table-cell">{t('Başarı')}</Table.Head>
          <Table.Head class="hidden sm:table-cell">{t('Kayıt')}</Table.Head>
          <Table.Head class="hidden lg:table-cell">{t('Son etkinlik')}</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.members.items as m (m.user.id)}
          <Table.Row>
            <Table.Cell>
              <div class="flex items-center gap-3">
                <UserAvatar user={m.user} size={34} />
                <div class="grid min-w-0">
                  <UserName user={m.user} />
                  {#if m.user.customTitle}<span class="truncate text-xs text-muted-foreground">{m.user.customTitle}</span>{/if}
                </div>
              </div>
            </Table.Cell>
            <Table.Cell class="hidden md:table-cell">
              {#if m.user.primaryGroup}<GroupBadge group={m.user.primaryGroup} />{/if}
            </Table.Cell>
            <Table.Cell class="hidden text-right tabular-nums sm:table-cell">{formatNumber(m.postCount)}</Table.Cell>
            <Table.Cell class="hidden text-right tabular-nums lg:table-cell">{formatNumber(m.achievementPoints)}</Table.Cell>
            <Table.Cell class="hidden text-muted-foreground sm:table-cell">{formatDate(m.registeredAt)}</Table.Cell>
            <Table.Cell class="hidden text-muted-foreground lg:table-cell">
              {#if m.lastActiveAt}<TimeAgo ms={m.lastActiveAt} />{:else}{t('Gizli')}{/if}
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
  <Pagination page={data.members.page} perPage={data.members.perPage} total={data.members.total} />
{/if}
