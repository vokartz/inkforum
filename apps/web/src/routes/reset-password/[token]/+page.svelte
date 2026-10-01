<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import PasswordStrength from '$lib/components/PasswordStrength.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';

  let valid = $state<boolean | null>(null);
  let done = $state(false);
  let password = $state('');
  let confirm = $state('');
  const form = createForm();

  onMount(async () => {
    try {
      valid = (await api.post<{ valid: boolean }>('/api/auth/password/reset/check', { token: page.params.token })).valid;
    } catch {
      valid = false;
    }
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (password !== confirm) {
      form.setError('confirm', t('Şifreler eşleşmiyor.'));
      return;
    }
    const res = await form.submit(() => api.post('/api/auth/password/reset', { token: page.params.token, password }));
    if (res) done = true;
  }
</script>

<AuthCard showcase title={t('Yeni şifre belirle')}>
  {#if valid === null}
    <p class="text-sm text-muted-foreground">{t('Kontrol ediliyor…')}</p>
  {:else if !valid}
    <FormMessage message={t('Bu bağlantı geçersiz veya süresi dolmuş. Yeni bir sıfırlama bağlantısı isteyin.')} />
    <Button href="/forgot-password" variant="outline" class="mt-4 w-full">{t('Yeni bağlantı iste')}</Button>
  {:else if done}
    <FormMessage variant="success" message={t('Şifreniz değiştirildi. Güvenliğiniz için tüm oturumlarınız kapatıldı.')} />
    <Button href="/login" class="mt-4 w-full">{t('Giriş yap')}</Button>
  {:else}
    <form class="grid gap-4" onsubmit={submit}>
      <FormMessage message={form.message} />
      <Field label={t('Yeni şifre')} for="password" error={form.error('password')}>
        <Input id="password" type="password" bind:value={password} autocomplete="new-password" required />
        <PasswordStrength {password} />
      </Field>
      <Field label={t('Yeni şifre (tekrar)')} for="confirm" error={form.error('confirm')}>
        <Input id="confirm" type="password" bind:value={confirm} autocomplete="new-password" required />
      </Field>
      <Button type="submit" disabled={form.submitting}>{form.submitting ? t('Kaydediliyor…') : t('Şifreyi değiştir')}</Button>
    </form>
  {/if}
</AuthCard>
