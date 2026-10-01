<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import WarningBar from '$lib/components/WarningBar.svelte';
  import WarningList from '$lib/components/WarningList.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import { formatDateTime } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const s = $derived(data.warnings.status);
  const until = (ms: number | null) => (ms && ms >= s.whileAboveUntil ? t('puanınız eşiğin altına inene kadar') : formatDateTime(ms));
</script>

<PageHeader title={t('Uyarılarım')} description={t('Kurallara aykırı davranışlar için verilen uyarılar ve puan durumunuz.')} />

<div class="grid max-w-3xl gap-6">
  <Card.Root>
    <Card.Content class="grid gap-3">
      <WarningBar points={s.points} max={s.maxPoints} />
      {#if s.mutedUntil}<FormMessage message={t('Mesaj yazmanız kısıtlandı ({until}).', { until: until(s.mutedUntil) })} />{/if}
      {#if s.moderatedUntil && !s.mutedUntil}
        <FormMessage variant="info" message={t('Mesajlarınız yayınlanmadan önce moderatör onayından geçiyor ({until}).', { until: until(s.moderatedUntil) })} />
      {/if}
    </Card.Content>
  </Card.Root>
  <WarningList items={data.warnings.items} />
</div>
