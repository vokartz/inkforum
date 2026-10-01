<script lang="ts">
  import type { AdminMailTransport, MailDriverChoice, MailVerifyResult } from '@forum/shared';
  import { untrack } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { slide } from 'svelte/transition';
  import PlugsConnectedIcon from 'phosphor-svelte/lib/PlugsConnected';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircle';
  import FloppyIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import FileTextIcon from 'phosphor-svelte/lib/FileText';
  import ServerIcon from 'phosphor-svelte/lib/HardDrives';
  import TerminalIcon from 'phosphor-svelte/lib/TerminalWindow';
  import GearIcon from 'phosphor-svelte/lib/GearSix';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import Field from '$lib/components/Field.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';

  let { transport }: { transport: AdminMailTransport } = $props();

  let driver = $state<MailDriverChoice>(untrack(() => transport.driver));
  let host = $state(untrack(() => transport.host));
  let port = $state(untrack(() => transport.port));
  let security = $state(untrack(() => transport.security));
  let user = $state(untrack(() => transport.user));
  let password = $state('');
  let allowSelfSigned = $state(untrack(() => transport.allowSelfSigned));
  let fieldErrors = $state<Record<string, string>>({});

  const DRIVERS: Array<{ v: MailDriverChoice; label: string; hint: string; icon: typeof ServerIcon }> = [
    { v: 'smtp', label: 'SMTP', hint: 'Gmail, Outlook, Yandex, Brevo, Mailgun…', icon: ServerIcon },
    { v: 'sendmail', label: 'Sendmail', hint: 'Sunucunun kendi e-posta programı (cPanel)', icon: TerminalIcon },
    { v: 'log', label: 'Gönderme', hint: 'Yalnızca storage/mail klasörüne yazar (test)', icon: FileTextIcon },
    { v: 'env', label: '.env dosyası', hint: 'MAIL_DRIVER / SMTP_URL değerleri', icon: GearIcon },
  ];
  // Yaygın sağlayıcılar: tıklayınca sunucu, port ve güvenlik doldurulur.
  const PRESETS = [
    { name: 'Gmail', host: 'smtp.gmail.com', port: 587, security: 'starttls' as const, note: 'Google hesabında 2 adımlı doğrulama açıp "Uygulama şifresi" oluşturun.' },
    { name: 'Outlook / Office 365', host: 'smtp.office365.com', port: 587, security: 'starttls' as const, note: 'Hesapta SMTP kimlik doğrulaması açık olmalı.' },
    { name: 'Yandex', host: 'smtp.yandex.com.tr', port: 465, security: 'tls' as const, note: 'Yandex Mail ayarlarından uygulama şifresi oluşturun.' },
    { name: 'Zoho', host: 'smtp.zoho.eu', port: 465, security: 'tls' as const, note: '' },
    { name: 'Brevo', host: 'smtp-relay.brevo.com', port: 587, security: 'starttls' as const, note: 'Kullanıcı adı ve anahtar Brevo → SMTP & API sayfasında.' },
    { name: 'Mailgun', host: 'smtp.eu.mailgun.org', port: 587, security: 'starttls' as const, note: '' },
    { name: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, security: 'starttls' as const, note: 'Kullanıcı adı "apikey", şifre API anahtarıdır.' },
    { name: 'cPanel hesabı', host: 'mail.alanadiniz.com', port: 465, security: 'tls' as const, note: 'cPanel → E-posta Hesapları → Bağlan bölümündeki bilgileri kullanın.' },
  ];
  let presetNote = $state('');
  function applyPreset(p: (typeof PRESETS)[number]) {
    host = p.host;
    port = p.port;
    security = p.security;
    presetNote = p.note;
  }
  // Port değişince yaygın güvenlik türü önerilir.
  function onPort() {
    if (port === 465) security = 'tls';
    else if (port === 587) security = 'starttls';
  }

  const body = () => ({ driver, host, port: Number(port), security, user, password: password || undefined, allowSelfSigned });

  let verifying = $state(false);
  let result = $state<MailVerifyResult | null>(null);
  async function verify() {
    verifying = true;
    result = null;
    fieldErrors = {};
    try {
      result = await api.post<MailVerifyResult>('/api/admin/mail/transport/verify', body());
    } catch (e) {
      if (e instanceof ApiError) fieldErrors = e.fields;
      toast.error(errorMessage(e));
    } finally {
      verifying = false;
    }
  }

  let saving = $state(false);
  async function save() {
    saving = true;
    fieldErrors = {};
    try {
      await api.put('/api/admin/mail/transport', body());
      password = '';
      toast.success(t('Gönderim ayarları kaydedildi.'));
      await invalidate('app:admin-mail');
    } catch (e) {
      if (e instanceof ApiError) fieldErrors = e.fields;
      toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }

  const effective = $derived(driver === 'env' ? transport.envDriver : driver);
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="text-base">{t('Gönderim yöntemi')}</Card.Title>
    <Card.Description>
      {t('E-postaların nasıl gönderileceği. Şu an kullanılan:')} <b class="text-foreground">{transport.effectiveDriver === 'smtp' ? 'SMTP' : transport.effectiveDriver === 'sendmail' ? 'Sendmail' : t('Gönderme (günlük)')}</b>
    </Card.Description>
  </Card.Header>
  <Card.Content class="grid gap-5">
    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {#each DRIVERS as d (d.v)}
        <button
          type="button"
          onclick={() => (driver = d.v)}
          class={cn('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent', driver === d.v && 'border-primary bg-primary-soft')}
          aria-pressed={driver === d.v}
        >
          <d.icon class={cn('mt-0.5 size-5 shrink-0', driver === d.v ? 'text-primary' : 'text-muted-foreground')} weight="duotone" />
          <span class="grid gap-0.5"><span class="text-sm font-bold">{t(d.label)}</span><span class="text-xs text-muted-foreground">{t(d.hint)}</span></span>
        </button>
      {/each}
    </div>

    {#if driver === 'env'}
      <p class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" transition:slide={{ duration: 180 }}>
        {t('.env dosyasındaki ayar kullanılıyor:')} <b class="text-foreground">MAIL_DRIVER={transport.envDriver}</b>. {t("Sunucu dosyalarına erişmeden değiştirmek için yukarıdan SMTP'yi seçin.")}
      </p>
    {/if}

    {#if driver === 'smtp'}
      <div class="grid gap-4" transition:slide={{ duration: 200 }}>
        <div class="grid gap-1.5">
          <p class="text-xs font-semibold text-muted-foreground">{t('Hazır ayarlar')}</p>
          <div class="flex flex-wrap gap-1.5">
            {#each PRESETS as p (p.name)}
              <button type="button" class={cn('rounded-full border px-3 py-1 text-xs font-semibold transition-colors hover:border-primary hover:text-highlight', host === p.host && 'border-primary bg-primary-soft text-highlight')} onclick={() => applyPreset(p)}>{t(p.name)}</button>
            {/each}
          </div>
          {#if presetNote}<p class="text-xs text-muted-foreground">💡 {t(presetNote)}</p>{/if}
        </div>
        <div class="grid gap-4 sm:grid-cols-[1fr_7rem_12rem]">
          <Field label={t('SMTP sunucusu')} error={fieldErrors.host}><Input bind:value={host} placeholder="smtp.ornek.com" autocomplete="off" /></Field>
          <Field label="Port" error={fieldErrors.port}><Input type="number" bind:value={port} min={1} max={65535} onchange={onPort} /></Field>
          <Field label={t('Güvenlik')}>
            <select bind:value={security} class="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="starttls">STARTTLS (587)</option>
              <option value="tls">SSL/TLS (465)</option>
              <option value="none">{t('Yok (25, önerilmez)')}</option>
            </select>
          </Field>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label={t('Kullanıcı adı')} hint={t('Genellikle e-posta adresinin tamamı.')}><Input bind:value={user} autocomplete="off" placeholder="noreply@ornek.com" /></Field>
          <Field label={t('Şifre')} hint={transport.hasPassword ? t('Kayıtlı şifre var; değiştirmek için yazın.') : t('Şifreli olarak saklanır.')}>
            <Input type="password" bind:value={password} autocomplete="new-password" placeholder={transport.hasPassword ? '••••••••' : ''} />
          </Field>
        </div>
        <label class="flex items-center gap-3 text-sm"><Switch bind:checked={allowSelfSigned} />{t('Kendinden imzalı sertifikaları kabul et')} <span class="text-xs text-muted-foreground">{t('(yalnızca kendi posta sunucunuz için)')}</span></label>
      </div>
    {/if}

    {#if result}
      <div
        transition:slide={{ duration: 180 }}
        class={cn('flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm', result.ok ? 'border-success/40 bg-success/10' : 'border-destructive/40 bg-destructive/10')}
        role="status"
      >
        {#if result.ok}<CheckCircleIcon class="mt-0.5 size-5 shrink-0 text-success" weight="fill" />{:else}<WarningCircleIcon class="mt-0.5 size-5 shrink-0 text-destructive" weight="fill" />{/if}
        <div class="grid gap-0.5">
          <b>{result.ok ? t('Bağlantı başarılı') : t('Bağlantı kurulamadı')}{#if result.ms} <span class="font-normal text-muted-foreground">· {result.ms} ms</span>{/if}</b>
          <span class="break-words text-foreground/85">{result.message}</span>
          {#if result.code}<code class="text-xs text-muted-foreground">{result.code}</code>{/if}
        </div>
      </div>
    {/if}

    <div class="flex flex-wrap gap-2">
      <Button variant="outline" onclick={verify} disabled={verifying || effective === 'log'}>
        {#if verifying}<LoaderIcon class="animate-spin" />{:else}<PlugsConnectedIcon />{/if}{t('Bağlantıyı test et')}
      </Button>
      <Button onclick={save} disabled={saving}>{#if saving}<LoaderIcon class="animate-spin" />{:else}<FloppyIcon />{/if}{t('Kaydet')}</Button>
    </div>
  </Card.Content>
</Card.Root>
