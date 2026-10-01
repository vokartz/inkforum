<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Shield';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import * as Table from '$lib/components/ui/table';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GroupBadge from '$lib/components/GroupBadge.svelte';
  import { formatNumber } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const kindLabel: Record<string, string> = { regular: 'Normal', post_count: 'Rütbe', system: 'Sistem' };
  const joinLabel: Record<string, string> = { closed: 'Kapalı', requestable: 'İstekle', free: 'Serbest' };
  const byId = $derived(new Map(data.groups.map((g) => [g.id, g])));
</script>

<PageHeader icon={PageHeaderIcon} title={t('Gruplar')} description={t('Üye grupları, renkleri, rozetleri ve katılım kuralları.')}>
  {#snippet actions()}<Button href="/admin/groups/new" size="sm"><PlusIcon />{t('Yeni grup')}</Button>{/snippet}
</PageHeader>

<div class="overflow-hidden rounded-xl border bg-card">
  <Table.Root>
    <Table.Header>
      <Table.Row>
        <Table.Head>{t('Grup')}</Table.Head>
        <Table.Head>{t('Tür')}</Table.Head>
        <Table.Head class="hidden md:table-cell">{t('Katılım')}</Table.Head>
        <Table.Head class="hidden md:table-cell">{t('Yetkiler')}</Table.Head>
        <Table.Head class="text-right">{t('Üye')}</Table.Head>
        <Table.Head></Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each data.groups as g (g.id)}
        <Table.Row>
          <Table.Cell>
            <div class="grid gap-1">
              <GroupBadge group={{ id: g.id, name: g.name, color: g.color, iconUrl: g.iconUrl, iconCount: g.iconCount }} />
              {#if g.description}<span class="line-clamp-1 max-w-md text-xs text-muted-foreground">{g.description}</span>{/if}
            </div>
          </Table.Cell>
          <Table.Cell class="text-sm">
            {kindLabel[g.kind] ? t(kindLabel[g.kind]!) : ''}{#if g.kind === 'post_count'} · {formatNumber(g.minPosts)}+{/if}
            {#if g.visibility === 'hidden'}<span class="text-xs text-muted-foreground"> · {t('gizli')}</span>{/if}
            {#if g.require2fa}<span class="text-xs text-muted-foreground"> · 2FA</span>{/if}
          </Table.Cell>
          <Table.Cell class="hidden text-sm md:table-cell">{g.kind === 'regular' ? (joinLabel[g.joinType] ? t(joinLabel[g.joinType]!) : '') : '—'}</Table.Cell>
          <Table.Cell class="hidden text-sm text-muted-foreground md:table-cell">
            {#if g.systemKey === 'admin'}{t('Tümü')}{:else if g.parentId}{t('{name} grubundan miras', { name: byId.get(g.parentId)?.name ?? '' })}{:else}{t('Kendi')}{/if}
          </Table.Cell>
          <Table.Cell class="text-right tabular-nums">{g.systemKey === 'guest' ? '—' : formatNumber(g.memberCount)}</Table.Cell>
          <Table.Cell class="text-right"><Button href="/admin/groups/{g.id}" size="sm" variant="outline">{t('Düzenle')}</Button></Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</div>
