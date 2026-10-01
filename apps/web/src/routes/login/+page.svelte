<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import WarningIcon from 'phosphor-svelte/lib/WarningCircle';
  import { Button } from '$lib/components/ui/button';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import LoginForm from '$lib/components/auth/LoginForm.svelte';
  import SocialButtons from '$lib/components/auth/SocialButtons.svelte';
  import { safeNext } from '$lib/nav';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const next = $derived(safeNext(page.url.searchParams.get('next')));
  const challenge = $derived(page.url.searchParams.get('challenge'));

  const SOCIAL_ERRORS: Record<string, string> = {
    state: 'Güvenlik doğrulaması tamamlanamadı; lütfen tekrar dene.',
    denied: 'Giriş iptal edildi.',
    provider: 'Giriş sağlayıcısıyla bağlantı kurulamadı. Biraz sonra tekrar dene.',
    config: 'Bu giriş yöntemi şu anda kullanılamıyor.',
    email_taken: 'Bu e-posta adresiyle kayıtlı bir hesap var. Önce şifrenle giriş yap, ardından Ayarlar → Güvenlik bölümünden hesabını bağla.',
    registration_closed: 'Yeni üye kayıtları şu anda kapalı.',
    banned: 'Hesabın yasaklanmış.',
    account_pending_email: 'Giriş yapmadan önce e-posta adresini doğrulamalısın.',
    account_pending_approval: 'Üyeliğin henüz yöneticiler tarafından onaylanmadı.',
    account_deactivated: 'Bu hesap devre dışı bırakılmış.',
    session: 'Oturumun değişti; lütfen tekrar dene.',
  };
  const socialError = $derived.by(() => {
    const code = page.url.searchParams.get('social_error');
    if (!code) return null;
    return SOCIAL_ERRORS[code] ? t(SOCIAL_ERRORS[code]) : t('Sosyal giriş tamamlanamadı.');
  });

  async function done() {
    await invalidateAll();
    await goto(next, { replaceState: true });
  }
</script>

{#if data.viewer.user}
  <AuthCard showcase title={t('Zaten giriş yaptınız')} description={t('Hesabınızla oturum açık.')}>
    <Button href="/" class="w-full">{t('Ana sayfaya dön')}</Button>
  </AuthCard>
{:else}
  <AuthCard showcase title={t('Tekrar hoş geldin')} description={t('Kullanıcı adın veya e-posta adresinle giriş yap.')}>
    {#if socialError}
      <p class="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"><WarningIcon class="mt-0.5 size-4 shrink-0" />{socialError}</p>
    {/if}
    {#if data.providers.length && !challenge}
      <SocialButtons providers={data.providers} {next} />
      <div class="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span class="h-px flex-1 bg-border"></span>{t('ya da')}<span class="h-px flex-1 bg-border"></span></div>
    {/if}
    <LoginForm ondone={done} autofocus={!challenge} initialChallenge={challenge} />
    {#snippet footer()}
      {#if data.viewer.settings['registration.mode'] !== 'closed'}
        {t('Hesabın yok mu?')} <a href="/register" class="ml-1 font-semibold text-link hover:underline">{t('Hemen kayıt ol')}</a>
      {/if}
    {/snippet}
  </AuthCard>
{/if}
