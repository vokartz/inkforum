<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import type { CaptchaConfig } from '@forum/shared';
  import PageHeaderIcon from 'phosphor-svelte/lib/Robot';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import * as Card from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SaveBar from '$lib/components/admin/SaveBar.svelte';
  import Field from '$lib/components/Field.svelte';
  import OptionCards from '$lib/components/admin/themes/OptionCards.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();

  const initial = () => structuredClone(data.captcha?.config ?? ({ provider: 'none', siteKey: '', forms: { register: true, login: false, forgot: true } } as CaptchaConfig));
  let cfg = $state(untrack(initial));
  let secret = $state('');
  let saved = $state(untrack(() => JSON.stringify(initial())));
  const dirty = $derived(JSON.stringify(cfg) !== saved || !!secret);
  const external = $derived(cfg.provider !== 'none' && cfg.provider !== 'builtin');
  const form = createForm();

  const LINKS: Record<string, { href: string; label: string }> = {
    turnstile: { href: 'https://dash.cloudflare.com/?to=/:account/turnstile', label: 'Cloudflare → Turnstile' },
    hcaptcha: { href: 'https://dashboard.hcaptcha.com/sites', label: 'hCaptcha → Sites' },
    recaptcha: { href: 'https://www.google.com/recaptcha/admin/create', label: 'Google reCAPTCHA (v2, "Ben robot değilim")' },
  };

  async function save() {
    const res = await form.submit(() => api.put<{ config: CaptchaConfig; hasSecret: boolean }>('/api/admin/captcha', { ...cfg, secret }));
    if (!res) return;
    cfg = structuredClone(res.config);
    saved = JSON.stringify(res.config);
    secret = '';
    toast.success(t('Kaydedildi.'));
    await invalidateAll();
  }
</script>

<svelte:head><title>{t('Captcha')}</title></svelte:head>

<PageHeader
  icon={PageHeaderIcon}
  title={t('Captcha')}
  description={t('Giriş, kayıt ve şifre sıfırlama formlarında robotlara karşı isteğe bağlı doğrulama.')}
/>

{#if data.captcha}
  <div class="grid max-w-3xl gap-5">
    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Sağlayıcı')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-4">
        <OptionCards
          bind:value={cfg.provider}
          cols={5}
          options={[
            { value: 'none', label: t('Kapalı') },
            { value: 'builtin', label: t('Yerleşik'), hint: t('Basit soru') },
            { value: 'turnstile', label: 'Turnstile', hint: 'Cloudflare' },
            { value: 'hcaptcha', label: 'hCaptcha' },
            { value: 'recaptcha', label: 'reCAPTCHA', hint: 'Google v2' },
          ]}
        />
        {#if cfg.provider === 'builtin'}
          <p class="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t('Dış servis ve anahtar gerekmez: formda "7 + 5 = ?" gibi basit bir soru çıkar. Basit botları durdurur; güçlü koruma için Turnstile ya da hCaptcha seçin.')}
          </p>
        {:else if external}
          <a href={LINKS[cfg.provider]!.href} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline"
            >{t('Anahtarları al: {where}', { where: LINKS[cfg.provider]!.label })}<ArrowSquareOutIcon class="size-3.5" /></a
          >
          <Field label={t('Site anahtarı')} for="cap-site" error={form.error('siteKey')}>
            <Input id="cap-site" bind:value={cfg.siteKey} autocomplete="off" class="font-mono" />
          </Field>
          <Field
            label={t('Gizli anahtar')}
            for="cap-secret"
            error={form.error('secret')}
            hint={data.captcha.hasSecret ? t('Kayıtlı bir anahtar var; değiştirmek için yenisini yazın.') : t('Sunucuda şifreli saklanır, tarayıcıya gönderilmez.')}
          >
            <Input id="cap-secret" type="password" bind:value={secret} autocomplete="off" class="font-mono" placeholder={data.captcha.hasSecret ? '••••••••' : ''} />
          </Field>
          {#if data.captcha.hasSecret && !secret}<p class="flex items-center gap-1.5 text-xs text-success"><CheckCircleIcon class="size-4" />{t('Gizli anahtar kayıtlı.')}</p>{/if}
        {/if}
      </Card.Content>
    </Card.Root>

    {#if cfg.provider !== 'none'}
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">{t('Hangi formlarda?')}</Card.Title>
          <Card.Description>{t('Sosyal hesapla giriş ve kayıtta captcha istenmez.')}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-3">
          {#each [{ k: 'register', l: t('Kayıt') }, { k: 'login', l: t('Giriş') }, { k: 'forgot', l: t('Şifremi unuttum') }] as f (f.k)}
            <label class="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium"
              >{f.l}<Switch bind:checked={cfg.forms[f.k as keyof CaptchaConfig['forms']]} /></label
            >
          {/each}
        </Card.Content>
      </Card.Root>
    {/if}
  </div>
{/if}

<SaveBar {dirty} saving={form.submitting} onsave={save} onreset={() => ((cfg = JSON.parse(saved)), (secret = ''))} />
