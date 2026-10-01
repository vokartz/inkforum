<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Scroll';
  import * as Table from '$lib/components/ui/table';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { formatDateTime } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const contextLabels: Record<string, string> = { access: 'Erişim', login: 'Giriş', register: 'Kayıt', post: 'Mesaj' };
</script>

<PageHeader icon={PageHeaderIcon} title={t('Yasak kayıtları')} description={t('Yasak kurallarına takılan erişim denemeleri.')}>
  {#snippet actions()}<Button href="/admin/bans" variant="outline" size="sm">{t('Yasaklar')}</Button>{/snippet}
</PageHeader>

{#if data.log}
  {#if !data.log.items.length}
    <EmptyState title={t('Kayıt yok')} />
  {:else}
    <div class="overflow-hidden rounded-xl border bg-card">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>{t('Zaman')}</Table.Head>
            <Table.Head>{t('Yasak')}</Table.Head>
            <Table.Head>{t('Eylem')}</Table.Head>
            <Table.Head>{t('Kimlik')}</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.log.items as r (r.id)}
            <Table.Row>
              <Table.Cell class="text-sm whitespace-nowrap text-muted-foreground">{formatDateTime(r.created_at)}</Table.Cell>
              <Table.Cell><a href="/admin/bans/{r.ban_id}" class="hover:underline">{r.ban_name}</a></Table.Cell>
              <Table.Cell>{contextLabels[r.context] ? t(contextLabels[r.context]!) : r.context}</Table.Cell>
              <Table.Cell class="font-mono text-xs">
                {#if r.user_id}<a href="/admin/users/{r.user_id}" class="underline">#{r.user_id}</a>{/if}
                {r.ip ?? ''}
                {r.email ?? ''}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
    <Pagination page={data.log.page} perPage={data.log.perPage} total={data.log.total} />
  {/if}
{/if}
