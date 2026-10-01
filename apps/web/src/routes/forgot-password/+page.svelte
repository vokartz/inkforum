<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';

  let email = $state('');
  let sent = $state(false);
  const form = createForm();

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const res = await form.submit(() => api.post('/api/auth/password/forgot', { email }));
    if (res) sent = true;
  }
</script>

<AuthCard showcase title={t('Şifremi unuttum')} description={t('Hesabınıza kayıtlı e-posta adresini girin; şifre sıfırlama bağlantısı gönderelim.')}>
  {#if sent}
    <FormMessage
      variant="success"
      message={t('Bu adrese kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu (ve istenmeyen klasörünü) kontrol edin.')}
    />
  {:else}
    <form class="grid gap-4" onsubmit={submit}>
      <FormMessage message={form.message} />
      <Field label={t('E-posta adresi')} for="email" error={form.error('email')}>
        <Input id="email" type="email" bind:value={email} autocomplete="email" required />
      </Field>
      <Button type="submit" disabled={form.submitting}>{form.submitting ? t('Gönderiliyor…') : t('Bağlantı gönder')}</Button>
    </form>
  {/if}
  {#snippet footer()}
    <a href="/login" class="text-primary hover:underline">{t('Giriş sayfasına dön')}</a>
  {/snippet}
</AuthCard>
