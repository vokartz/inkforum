<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import PasswordStrength from '$lib/components/PasswordStrength.svelte';
  import { invalidateAll } from '$app/navigation';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirm = $state('');
  let done = $state(false);
  const form = createForm();

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    done = false;
    if (newPassword !== confirm) {
      form.setError('confirm', t('Şifreler eşleşmiyor.'));
      return;
    }
    const res = await form.submit(() => api.post('/api/auth/password/change', { currentPassword, newPassword }));
    if (res) {
      done = true;
      await invalidateAll();
      currentPassword = newPassword = confirm = '';
    }
  }
</script>

<PageHeader title={t('Şifre')} description={t('Şifrenizi değiştirdiğinizde diğer cihazlardaki oturumlarınız kapatılır.')} />

<Card.Root class="max-w-lg">
  <Card.Content>
    <form class="grid gap-4" onsubmit={submit}>
      <FormMessage message={form.message} />
      {#if done}<FormMessage variant="success" message={t('Şifreniz değiştirildi. Diğer oturumlarınız kapatıldı.')} />{/if}
      {#if data.viewer.user?.hasPassword === false}
        <p class="rounded-md border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">{t('Hesabın sosyal girişle açıldı ve henüz şifresi yok. Buradan bir şifre belirlersen kullanıcı adınla da giriş yapabilirsin.')}</p>
      {:else}
        <Field label={t('Mevcut şifre')} for="current" error={form.error('currentPassword')}>
          <Input id="current" type="password" bind:value={currentPassword} autocomplete="current-password" required />
        </Field>
      {/if}
      <Field label={t('Yeni şifre')} for="new" error={form.error('newPassword')}>
        <Input id="new" type="password" bind:value={newPassword} autocomplete="new-password" required />
        <PasswordStrength password={newPassword} />
      </Field>
      <Field label={t('Yeni şifre (tekrar)')} for="confirm" error={form.error('confirm')}>
        <Input id="confirm" type="password" bind:value={confirm} autocomplete="new-password" required />
      </Field>
      <div><Button type="submit" disabled={form.submitting}>{t('Şifreyi değiştir')}</Button></div>
    </form>
  </Card.Content>
</Card.Root>
