<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Prohibit';
  import { goto } from '$app/navigation';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import BanForm from '$lib/components/admin/BanForm.svelte';
  import { formatDateTime } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const b = $derived(data.ban);
</script>

{#if b}
  <PageHeader icon={PageHeaderIcon} title={b.name} description={b.isActive ? t('Aktif yasak') : t('Pasif yasak')}>
    {#snippet actions()}<Button href="/admin/bans" variant="outline" size="sm">{t('Tüm yasaklar')}</Button>{/snippet}
  </PageHeader>
  <div class="grid gap-6 lg:grid-cols-[1fr_280px]">
    <Card.Root>
      <Card.Content>
        {#key b.id}
          <BanForm banId={b.id} initial={{ ...b, triggers: b.triggers.map((t) => ({ type: t.type === 'ip_range' ? 'ip' : t.type, value: t.value })) }} ondone={() => goto('/admin/bans')} />
        {/key}
      </Card.Content>
    </Card.Root>
    <Card.Root class="h-fit">
      <Card.Header><Card.Title class="text-base">{t('Eşleşmeler')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-2 text-sm">
        {#each b.triggers as t (t.id)}
          <div class="flex items-center justify-between gap-2">
            <span class="truncate font-mono text-xs">{t.value}</span>
            <span class="text-xs text-muted-foreground">{t.hits}{#if t.lastHitAt} · {formatDateTime(t.lastHitAt)}{/if}</span>
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  </div>
{/if}
