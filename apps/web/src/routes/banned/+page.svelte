<script lang="ts">
  import BanIcon from 'phosphor-svelte/lib/Prohibit';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import { formatDateTime } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const ban = $derived(data.viewer.flags.ban);
</script>

<AuthCard title={t('Erişiminiz engellendi')}>
  <div class="grid justify-items-center gap-3 text-center">
    <div class="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><BanIcon class="size-7" /></div>
    {#if ban}
      <p>{ban.reason ?? t('Bu foruma erişiminiz yöneticiler tarafından engellendi.')}</p>
      <p class="text-sm text-muted-foreground">
        {ban.expiresAt ? t('Yasak {date} tarihinde sona erecek.', { date: formatDateTime(ban.expiresAt) }) : t('Bu yasağın bitiş tarihi yok.')}
      </p>
    {:else}
      <p class="text-muted-foreground">{t('Şu anda aktif bir yasak görünmüyor.')}</p>
      <a href="/" class="text-primary hover:underline">{t('Ana sayfaya dön')}</a>
    {/if}
  </div>
</AuthCard>
