<script lang="ts">
  import { page } from '$app/state';
  import MailCheckIcon from 'phosphor-svelte/lib/EnvelopeOpen';
  import HourglassIcon from 'phosphor-svelte/lib/Hourglass';
  import { Button } from '$lib/components/ui/button';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n.svelte';

  const status = $derived(page.url.searchParams.get('status'));
  const email = $derived(page.url.searchParams.get('email') ?? '');
  let resent = $state(false);

  async function resend() {
    await api.post('/api/auth/verify-email/resend', { email }).catch(() => undefined);
    resent = true;
  }
</script>

{#if status === 'pending_email'}
  <AuthCard showcase title={t('E-postanızı kontrol edin')}>
    <div class="grid justify-items-center gap-4 text-center">
      <div class="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MailCheckIcon class="size-7" /></div>
      <p class="text-sm text-muted-foreground">
        <strong class="text-foreground">{email}</strong>
        {t('adresine bir doğrulama bağlantısı gönderdik. Hesabınızı etkinleştirmek için bağlantıya tıklayın.')}
      </p>
      {#if resent}
        <p class="text-sm text-success">{t('Doğrulama e-postası tekrar gönderildi.')}</p>
      {:else}
        <Button variant="outline" size="sm" onclick={resend}>{t('E-postayı tekrar gönder')}</Button>
      {/if}
    </div>
  </AuthCard>
{:else}
  <AuthCard showcase title={t('Başvurunuz alındı')}>
    <div class="grid justify-items-center gap-4 text-center">
      <div class="flex size-14 items-center justify-center rounded-2xl bg-warning/20"><HourglassIcon class="size-7" /></div>
      <p class="text-sm text-muted-foreground">
        {t('Üyeliğiniz yöneticiler tarafından incelendikten sonra etkinleşecek. Onaylandığında size e-posta ile haber vereceğiz.')}
      </p>
      <Button href="/" variant="outline" size="sm">{t('Ana sayfaya dön')}</Button>
    </div>
  </AuthCard>
{/if}
