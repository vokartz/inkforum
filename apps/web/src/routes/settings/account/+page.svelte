<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { formatDate } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const p = data.profile;

  let username = $state(p.username);
  let displayName = $state(p.displayName);
  let email = $state('');
  let emailPassword = $state('');
  let emailSent = $state(false);

  const userForm = createForm();
  const nameForm = createForm();
  const emailForm = createForm();

  const nextUsernameChange = $derived(
    p.usernameChangedAt && p.limits.usernameCooldownDays
      ? p.usernameChangedAt + p.limits.usernameCooldownDays * 86_400_000
      : null,
  );

  async function saveUsername(e: SubmitEvent) {
    e.preventDefault();
    if (await userForm.submit(() => api.post('/api/me/username', { username }), { success: t('Kullanıcı adınız değiştirildi.') })) await invalidateAll();
  }

  async function saveDisplayName(e: SubmitEvent) {
    e.preventDefault();
    if (await nameForm.submit(() => api.post('/api/me/display-name', { displayName }), { success: t('Görünen adınız değiştirildi.') }))
      await invalidateAll();
  }

  async function changeEmail(e: SubmitEvent) {
    e.preventDefault();
    const res = await emailForm.submit(() => api.post('/api/me/email', { email, password: emailPassword }));
    if (res) {
      emailSent = true;
      emailPassword = '';
    }
  }
</script>

<PageHeader title={t('Hesap')} description={t('Kullanıcı adı, görünen ad ve e-posta adresi.')} />

<div class="grid gap-6">
  <Card.Root>
    <Card.Header>
      <Card.Title class="text-base">{t('Görünen ad')}</Card.Title>
      <Card.Description>{t('Forumda isminiz olarak bu gösterilir.')}</Card.Description>
    </Card.Header>
    <Card.Content>
      <form class="flex flex-wrap items-start gap-2" onsubmit={saveDisplayName}>
        <Field for="displayName" error={nameForm.error('displayName') ?? nameForm.message} class="min-w-60 flex-1">
          <Input id="displayName" bind:value={displayName} maxlength={40} disabled={!p.can.changeDisplayName} />
        </Field>
        <Button type="submit" variant="outline" disabled={!p.can.changeDisplayName || nameForm.submitting || displayName === p.displayName}>{t('Kaydet')}</Button>
      </form>
      {#if !p.can.changeDisplayName}<p class="mt-2 text-xs text-muted-foreground">{t('Görünen adınızı değiştirme yetkiniz yok.')}</p>{/if}
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title class="text-base">{t('Kullanıcı adı')}</Card.Title>
      <Card.Description>
        {t('Giriş yaparken kullandığınız ad.')}
        {#if p.limits.usernameCooldownDays}{t('Her {n} günde bir değiştirilebilir.', { n: p.limits.usernameCooldownDays })}{/if}
      </Card.Description>
    </Card.Header>
    <Card.Content>
      {#if p.can.changeUsername}
        <form class="flex flex-wrap items-start gap-2" onsubmit={saveUsername}>
          <Field for="username" error={userForm.error('username') ?? userForm.message} class="min-w-60 flex-1">
            <Input id="username" bind:value={username} maxlength={50} />
          </Field>
          <Button type="submit" variant="outline" disabled={userForm.submitting || username === p.username}>{t('Değiştir')}</Button>
        </form>
        {#if nextUsernameChange && nextUsernameChange > Date.now()}
          <p class="mt-2 text-xs text-muted-foreground">{t('Bir sonraki değişiklik: {date}', { date: formatDate(nextUsernameChange) })}</p>
        {/if}
      {:else}
        <p class="text-sm"><span class="font-medium">{p.username}</span></p>
        <p class="mt-1 text-xs text-muted-foreground">{t('Kullanıcı adı değişikliği için yöneticilerle iletişime geçin.')}</p>
      {/if}
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title class="text-base">{t('E-posta adresi')}</Card.Title>
      <Card.Description>{t('Şu anki adresiniz:')} <strong>{p.email}</strong></Card.Description>
    </Card.Header>
    <Card.Content>
      {#if emailSent}
        <FormMessage variant="success" message={t('Yeni adresinize bir onay bağlantısı gönderdik. Değişiklik, bağlantıya tıkladığınızda tamamlanacak.')} />
      {:else}
        <form class="grid gap-3 sm:max-w-md" onsubmit={changeEmail}>
          <FormMessage message={emailForm.message} />
          <Field label={t('Yeni e-posta')} for="newEmail" error={emailForm.error('email')}>
            <Input id="newEmail" type="email" bind:value={email} autocomplete="email" required />
          </Field>
          <Field label={t('Mevcut şifreniz')} for="emailPassword" error={emailForm.error('password')}>
            <Input id="emailPassword" type="password" bind:value={emailPassword} autocomplete="current-password" required />
          </Field>
          <div><Button type="submit" variant="outline" disabled={emailForm.submitting}>{t('Onay bağlantısı gönder')}</Button></div>
        </form>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
