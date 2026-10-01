<script lang="ts">
  import { page } from '$app/state';
  import { invalidate, invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import QRCode from 'qrcode';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheck';
  import ShieldAlertIcon from 'phosphor-svelte/lib/ShieldWarning';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const required = $derived(page.url.searchParams.get('required') === '1' || data.viewer.flags.twoFactorSetupRequired);

  let setup = $state<{ secret: string; otpauthUrl: string; qr: string } | null>(null);
  let code = $state('');
  let recoveryCodes = $state<string[] | null>(null);
  let disablePassword = $state('');
  let disableCode = $state('');
  let regenPassword = $state('');

  const setupForm = createForm();
  const disableForm = createForm();
  const regenForm = createForm();

  async function begin() {
    const res = await setupForm.submit(() => api.post<{ secret: string; otpauthUrl: string }>('/api/me/2fa/setup'));
    if (!res) return;
    const qr = await QRCode.toDataURL(res.otpauthUrl, { margin: 1, width: 200 });
    setup = { ...res, qr };
  }

  async function confirm(e: SubmitEvent) {
    e.preventDefault();
    const res = await setupForm.submit(() => api.post<{ recoveryCodes: string[] }>('/api/me/2fa/confirm', { code }));
    if (!res) return;
    recoveryCodes = res.recoveryCodes;
    setup = null;
    code = '';
    toast.success(t('İki adımlı doğrulama etkinleştirildi.'));
    await invalidateAll();
  }

  async function disable(e: SubmitEvent) {
    e.preventDefault();
    const res = await disableForm.submit(() => api.post('/api/me/2fa/disable', { password: disablePassword, code: disableCode }), {
      success: t('İki adımlı doğrulama kapatıldı.'),
    });
    if (res) {
      disablePassword = disableCode = '';
      recoveryCodes = null;
      await invalidateAll();
    }
  }

  async function regenerate(e: SubmitEvent) {
    e.preventDefault();
    const res = await regenForm.submit(() => api.post<{ recoveryCodes: string[] }>('/api/me/2fa/recovery-codes', { password: regenPassword }));
    if (res) {
      recoveryCodes = res.recoveryCodes;
      regenPassword = '';
      await invalidate('app:2fa');
    }
  }

  async function copyCodes() {
    if (!recoveryCodes) return;
    await navigator.clipboard.writeText(recoveryCodes.join('\n'));
    toast.success(t('Kurtarma kodları kopyalandı.'));
  }
</script>

<PageHeader title={t('İki adımlı doğrulama')} description={t('Girişte şifrenize ek olarak telefonunuzdaki bir kod istenir.')} />

<div class="grid max-w-2xl gap-6">
  {#if required && !data.status.enabled}
    <FormMessage message={t('Üyesi olduğunuz grup iki adımlı doğrulama kullanmanızı gerektiriyor. Devam etmek için lütfen kurulumu tamamlayın.')} />
  {/if}

  {#if recoveryCodes}
    <Card.Root class="border-warning/50">
      <Card.Header>
        <Card.Title class="text-base">{t('Kurtarma kodlarınız')}</Card.Title>
        <Card.Description>
          {t('Telefonunuza erişemezseniz bu kodlarla giriş yapabilirsiniz. Her kod yalnızca bir kez kullanılabilir. Bu kodlar bir daha gösterilmeyecek; güvenli bir yere kaydedin.')}
        </Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-3">
        <div class="grid grid-cols-2 gap-2 rounded-lg bg-muted p-4 font-mono text-sm sm:grid-cols-5">
          {#each recoveryCodes as c (c)}<span>{c}</span>{/each}
        </div>
        <div><Button variant="outline" size="sm" onclick={copyCodes}><CopyIcon />{t('Kopyala')}</Button></div>
      </Card.Content>
    </Card.Root>
  {/if}

  <Card.Root>
    <Card.Header>
      <Card.Title class="flex items-center gap-2 text-base">
        {#if data.status.enabled}<ShieldCheckIcon class="size-5 text-success" />{t('Etkin')}{:else}<ShieldAlertIcon
            class="size-5 text-muted-foreground"
          />{t('Kapalı')}{/if}
      </Card.Title>
      {#if data.status.enabled}
        <Card.Description>{t('Kalan kurtarma kodu: {n}', { n: data.status.remainingRecoveryCodes })}</Card.Description>
      {/if}
    </Card.Header>
    <Card.Content class="grid gap-4">
      <FormMessage message={setupForm.message} />
      {#if !data.status.enabled}
        {#if !setup}
          <p class="text-sm text-muted-foreground">
            {t('Google Authenticator, Microsoft Authenticator, 1Password veya benzeri bir uygulama kullanabilirsiniz.')}
          </p>
          <div><Button onclick={begin} disabled={setupForm.submitting}>{t('Kurulumu başlat')}</Button></div>
        {:else}
          <div class="flex flex-col gap-4 sm:flex-row">
            <img src={setup.qr} alt={t('Doğrulama uygulaması için QR kodu')} width="200" height="200" class="rounded-lg border bg-white p-2" />
            <div class="grid content-start gap-3 text-sm">
              <p>{t('1. Doğrulama uygulamanızla QR kodu tarayın.')}</p>
              <p class="text-muted-foreground">
                {t('Tarayamıyorsanız bu anahtarı elle girin:')}<br /><code class="font-mono text-xs break-all">{setup.secret}</code>
              </p>
              <p>{t('2. Uygulamada görünen 6 haneli kodu girin.')}</p>
              <form class="flex gap-2" onsubmit={confirm}>
                <Input bind:value={code} inputmode="numeric" autocomplete="one-time-code" placeholder="123456" class="w-36 font-mono tracking-widest" />
                <Button type="submit" disabled={setupForm.submitting || code.length < 6}>{t('Etkinleştir')}</Button>
              </form>
            </div>
          </div>
        {/if}
      {:else}
        <form class="grid gap-3 sm:max-w-md" onsubmit={regenerate}>
          <p class="text-sm font-medium">{t('Yeni kurtarma kodları oluştur')}</p>
          <FormMessage message={regenForm.message} />
          <Field label={t('Şifreniz')} for="regen-pw" error={regenForm.error('password')}>
            <Input id="regen-pw" type="password" bind:value={regenPassword} autocomplete="current-password" />
          </Field>
          <div><Button type="submit" variant="outline" disabled={regenForm.submitting || !regenPassword}>{t('Kodları yenile')}</Button></div>
        </form>
      {/if}
    </Card.Content>
  </Card.Root>

  {#if data.status.enabled}
    <Card.Root>
      <Card.Header>
        <Card.Title class="text-base">{t('İki adımlı doğrulamayı kapat')}</Card.Title>
        <Card.Description>{t('Hesabınızın güvenliği azalır.')}</Card.Description>
      </Card.Header>
      <Card.Content>
        <form class="grid gap-3 sm:max-w-md" onsubmit={disable}>
          <FormMessage message={disableForm.message} />
          <Field label={t('Şifreniz')} for="dis-pw" error={disableForm.error('password')}>
            <Input id="dis-pw" type="password" bind:value={disablePassword} autocomplete="current-password" />
          </Field>
          <Field label={t('Doğrulama kodu')} for="dis-code" error={disableForm.error('code')}>
            <Input id="dis-code" bind:value={disableCode} autocomplete="one-time-code" />
          </Field>
          <div><Button type="submit" variant="destructive" disabled={disableForm.submitting}>{t('Kapat')}</Button></div>
        </form>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
