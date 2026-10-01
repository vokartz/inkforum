<script lang="ts">
  import * as Table from '$lib/components/ui/table';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { formatDateTime } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
</script>

<PageHeader title={t('Onay geçmişi')} description={t('Kabul ettiğiniz kullanım koşulları ve politikaların kaydı.')} />

{#if !data.history.length}
  <EmptyState title={t('Kayıt yok')} />
{:else}
  <div class="overflow-hidden rounded-xl border bg-card">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>{t('Metin')}</Table.Head>
          <Table.Head>{t('Sürüm')}</Table.Head>
          <Table.Head>{t('Onay tarihi')}</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.history as h (h.id)}
          <Table.Row>
            <Table.Cell><a href="/policies/{h.key}" class="text-primary hover:underline">{h.title ?? h.key}</a></Table.Cell>
            <Table.Cell>v{h.version}</Table.Cell>
            <Table.Cell class="text-muted-foreground">{formatDateTime(h.accepted_at)}</Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
{/if}
