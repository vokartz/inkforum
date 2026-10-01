<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import PasswordStrength from '$lib/components/PasswordStrength.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const forced = $derived(data.viewer.flags.mustChangePassword);

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirm = $state('');
  const form = createForm();

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      form.setError('confirm', t('Şifreler eşleşmiyor.'));
      return;
    }
    const res = await form.submit(() => api.post('/api/auth/password/change', { currentPassword, newPassword }), {
      success: t('Şifreniz değiştirildi.'),
    });
    if (res) {
      await invalidateAll();
      await goto('/', { replaceState: true });
    }
  }
</script>

{#if !data.viewer.user}
  <AuthCard title={t('Giriş gerekli')}><Button href="/login" class="w-full">{t('Giriş yap')}</Button></AuthCard>
{:else}
  <AuthCard
    title={t('Şifrenizi değiştirin')}
    description={forced ? t('Devam etmeden önce hesabınız için yeni bir şifre belirlemelisiniz.') : undefined}
  >
    <form class="grid gap-4" onsubmit={submit}>
      <FormMessage message={form.message} />
      <Field
        label={t('Mevcut şifre')}
        for="current"
        error={form.error('currentPassword')}
        hint={forced ? t('Az önce giriş yaptığınız şifre.') : null}
      >
        <Input id="current" type="password" bind:value={currentPassword} autocomplete="current-password" required={!forced} />
      </Field>
      <Field label={t('Yeni şifre')} for="new" error={form.error('newPassword')}>
        <Input id="new" type="password" bind:value={newPassword} autocomplete="new-password" required />
        <PasswordStrength password={newPassword} />
      </Field>
      <Field label={t('Yeni şifre (tekrar)')} for="confirm" error={form.error('confirm')}>
        <Input id="confirm" type="password" bind:value={confirm} autocomplete="new-password" required />
      </Field>
      <Button type="submit" disabled={form.submitting}>{form.submitting ? t('Kaydediliyor…') : t('Şifreyi değiştir')}</Button>
    </form>
  </AuthCard>
{/if}
