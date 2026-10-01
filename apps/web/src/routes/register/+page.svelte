<script lang="ts">
  import type { RegisterResult } from '@forum/shared';
  import { goto, invalidateAll } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import RegisterForm from '$lib/components/auth/RegisterForm.svelte';
  import SocialButtons from '$lib/components/auth/SocialButtons.svelte';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();

  async function done(res: RegisterResult, email: string) {
    if (res.status === 'active') {
      await invalidateAll();
      await goto('/?welcome=1', { replaceState: true });
    } else {
      await goto(`/register/done?status=${res.status}&email=${encodeURIComponent(email)}`, { replaceState: true });
    }
  }
</script>

{#if data.viewer.user}
  <AuthCard showcase title={t('Zaten üyesiniz')} description={t('Hesabınızla oturum açık.')}>
    <Button href="/" class="w-full">{t('Ana sayfaya dön')}</Button>
  </AuthCard>
{:else if data.info.mode === 'closed'}
  <AuthCard showcase title={t('Kayıtlar kapalı')} description={t('Şu anda yeni üye kabul edilmiyor. Lütfen daha sonra tekrar deneyin.')}>
    <Button href="/" variant="outline" class="w-full">{t('Ana sayfaya dön')}</Button>
  </AuthCard>
{:else}
  <AuthCard showcase wide title={t('Topluluğa katıl')} description={t('Birkaç bilgi yeterli; bir dakikadan kısa sürer.')}>
    {#if data.providers.length}
      <SocialButtons providers={data.providers} next="/" />
      <div class="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span class="h-px flex-1 bg-border"></span>{t('ya da e-postayla kayıt ol')}<span class="h-px flex-1 bg-border"></span></div>
    {/if}
    <RegisterForm info={data.info} ondone={done} />
    {#snippet footer()}
      {t('Zaten hesabın var mı?')} <a href="/login" class="ml-1 font-semibold text-link hover:underline">{t('Giriş yap')}</a>
    {/snippet}
  </AuthCard>
{/if}
