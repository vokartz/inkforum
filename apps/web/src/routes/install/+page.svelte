<script lang="ts">
  import {
    PLUGINS,
    REGISTRATION_MODES,
    passwordStrength,
    type InstallCheck,
    type InstallEnvironment,
    type MailVerifyResult,
    type PluginKey,
    type RegistrationMode,
    type ThemeStyle,
  } from '@forum/shared';
  import { onMount } from 'svelte';
  import { fly, fade, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import WarningIcon from 'phosphor-svelte/lib/WarningCircle';
  import XCircleIcon from 'phosphor-svelte/lib/XCircle';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import EyeIcon from 'phosphor-svelte/lib/Eye';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import MoonIcon from 'phosphor-svelte/lib/Moon';
  import SunIcon from 'phosphor-svelte/lib/Sun';
  import PlugsIcon from 'phosphor-svelte/lib/PlugsConnected';
  import RocketIcon from 'phosphor-svelte/lib/RocketLaunch';
  import GaugeIcon from 'phosphor-svelte/lib/Gauge';
  import HouseIcon from 'phosphor-svelte/lib/HouseLine';
  import ShoutIcon from 'phosphor-svelte/lib/ChatCenteredDots';
  import DiscordIcon from 'phosphor-svelte/lib/DiscordLogo';
  import BookIcon from 'phosphor-svelte/lib/BookOpenText';
  import ClipboardIcon from 'phosphor-svelte/lib/ClipboardText';
  import LifebuoyIcon from 'phosphor-svelte/lib/Lifebuoy';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import Field from '$lib/components/Field.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import LanguagePicker from '$lib/components/layout/LanguagePicker.svelte';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';
  import ThemePreview from './ThemePreview.svelte';

  const STEPS = [
    { key: 'system', title: 'Hoş geldin', hint: 'Sistem denetimi' },
    { key: 'site', title: 'Site', hint: 'Ad ve görünüm' },
    { key: 'admin', title: 'Yönetici', hint: 'Hesabın' },
    { key: 'community', title: 'Topluluk', hint: 'Kayıt ve eklentiler' },
    { key: 'mail', title: 'E-posta', hint: 'İsteğe bağlı' },
    { key: 'finish', title: 'Kurulum', hint: 'Özet' },
  ] as const;
  type StepKey = (typeof STEPS)[number]['key'];

  let step = $state(0);
  let dir = $state(1);
  let busy = $state(false);
  let errors = $state<Record<string, string>>({});
  let done = $state(false);

  // Adım 1
  let env = $state<InstallEnvironment | null>(null);
  let envError = $state('');

  // Adım 3
  let site = $state({ name: '', description: '', theme: 'modern' as ThemeStyle, accent: '#9c9c9c', mode: 'dark' as 'dark' | 'light' });
  const ACCENTS = ['#9c9c9c', '#7b61ff', '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
  const THEMES = [
    { key: 'modern', label: 'Modern', hint: 'Kartlar, ferah boşluklar, akıcı animasyonlar' },
    { key: 'community', label: 'Topluluk', hint: 'Bannerlı üst alan, altında menü çubuğu; geniş kartlar' },
  ] as const;

  // Adım 4
  let admin = $state({ username: '', email: '', password: '', confirm: '' });
  let showPw = $state(false);
  const strength = $derived(passwordStrength(admin.password));
  const STRENGTH = ['Çok zayıf', 'Zayıf', 'Orta', 'İyi', 'Güçlü'];

  // Adım 5
  let registration = $state<RegistrationMode>('email');
  const REG_INFO: Record<RegistrationMode, { label: string; hint: string }> = {
    open: { label: 'Anında kayıt', hint: 'Üyeler kaydolur olmaz yazmaya başlar.' },
    email: { label: 'E-posta doğrulaması', hint: 'Önerilen. E-posta ayarı gerektirir.' },
    approval: { label: 'Yönetici onayı', hint: 'Her üyeliği sen onaylarsın.' },
    email_approval: { label: 'E-posta + onay', hint: 'En sıkı seçenek.' },
    closed: { label: 'Kayıtlar kapalı', hint: 'Yalnızca sen üye ekleyebilirsin.' },
  };
  let sampleContent = $state(true);
  let plugins = $state<PluginKey[]>(['wiki']);
  const PLUGIN_ICONS: Record<PluginKey, typeof HouseIcon> = { landing: HouseIcon, wiki: BookIcon, applications: ClipboardIcon, tickets: LifebuoyIcon, shoutbox: ShoutIcon, discord: DiscordIcon };

  // Adım 6
  let mailOn = $state(false);
  let mail = $state({ host: '', port: 587, security: 'starttls' as 'starttls' | 'tls' | 'none', user: '', password: '' });
  let mailFrom = $state('');
  let mailResult = $state<MailVerifyResult | null>(null);
  const PRESETS = [
    { name: 'Gmail', host: 'smtp.gmail.com', port: 587, security: 'starttls' as const },
    { name: 'Outlook', host: 'smtp.office365.com', port: 587, security: 'starttls' as const },
    { name: 'Yandex', host: 'smtp.yandex.com.tr', port: 465, security: 'tls' as const },
    { name: 'Brevo', host: 'smtp-relay.brevo.com', port: 587, security: 'starttls' as const },
    { name: 'Mailgun', host: 'smtp.eu.mailgun.org', port: 587, security: 'starttls' as const },
  ];

  const checks = $derived(env?.checks ?? []);
  const failed = $derived(checks.some((c) => c.status === 'fail'));
  const originMismatch = $derived(!!env && typeof window !== 'undefined' && new URL(env.appUrl).origin !== window.location.origin);

  function go(to: number) {
    dir = to > step ? 1 : -1;
    step = to;
    errors = {};
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadEnvironment() {
    envError = '';
    try {
      env = await api.get<InstallEnvironment>('/api/install/environment');
      if (!site.name) site.name = env.suggestedName === 'Forum' ? '' : env.suggestedName;
    } catch (err) {
      envError = errorMessage(err);
    }
  }
  onMount(loadEnvironment);

  function validate(key: StepKey): boolean {
    const e: Record<string, string> = {};
    if (key === 'site' && site.name.trim().length < 2) e['site.name'] = t('Forum adı en az 2 karakter olmalı.');
    if (key === 'admin') {
      if (admin.username.trim().length < 3) e['admin.username'] = t('Kullanıcı adı en az 3 karakter olmalı.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email.trim())) e['admin.email'] = t('Geçerli bir e-posta adresi girin.');
      if (admin.password.length < 10) e['admin.password'] = t('Şifre en az 10 karakter olmalı.');
      else if (!/[a-zçğıöşü]/.test(admin.password) || !/[A-ZÇĞİÖŞÜ]/.test(admin.password) || !/\d/.test(admin.password)) e['admin.password'] = t('Büyük harf, küçük harf ve rakam kullanın.');
      if (admin.confirm !== admin.password) e['admin.confirm'] = t('Şifreler aynı değil.');
    }
    if (key === 'mail' && mailOn) {
      if (!/^[a-z0-9.-]+$/i.test(mail.host)) e['mail.host'] = t('Geçerli bir SMTP sunucusu girin.');
      if (mailFrom && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailFrom)) e.mailFrom = t('Geçerli bir e-posta adresi girin.');
    }
    errors = e;
    return !Object.keys(e).length;
  }

  function next() {
    const key = STEPS[step]!.key;
    if (!validate(key)) return;
    go(step + 1);
  }

  const mailBody = () => ({ driver: 'smtp' as const, host: mail.host.trim(), port: Number(mail.port), security: mail.security, user: mail.user.trim(), password: mail.password || undefined, allowSelfSigned: false });

  async function testMail() {
    if (!validate('mail')) return;
    busy = true;
    mailResult = null;
    try {
      mailResult = await api.post<MailVerifyResult>('/api/install/mail-test', { mail: mailBody() });
    } catch (err) {
      mailResult = { ok: false, ms: 0, code: null, message: errorMessage(err) };
    } finally {
      busy = false;
    }
  }

  const STEP_OF: Record<string, number> = { site: 1, admin: 2, community: 3, mail: 4, mailFrom: 4 };
  async function install() {
    busy = true;
    errors = {};
    try {
      await api.post('/api/install', {
        site: { ...site, name: site.name.trim(), description: site.description.trim() },
        admin: { username: admin.username.trim(), email: admin.email.trim(), password: admin.password },
        community: { registration, sampleContent, plugins },
        mail: mailOn ? mailBody() : null,
        mailFrom: mailOn && mailFrom.trim() ? mailFrom.trim() : null,
      });
      done = true;
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        errors = err.fields;
        const first = Object.keys(err.fields)[0]!.split('.')[0]!;
        if (first in STEP_OF) go(STEP_OF[first]!);
        errors = err.fields;
      } else errors = { install: errorMessage(err) };
    } finally {
      busy = false;
    }
  }

  const statusIcon = (s: InstallCheck['status']) => (s === 'ok' ? CheckCircleIcon : s === 'warn' ? WarningIcon : XCircleIcon);
  const statusColor = (s: InstallCheck['status']) => (s === 'ok' ? 'text-success' : s === 'warn' ? 'text-warning' : 'text-destructive');
</script>

<svelte:head>
  <title>{t('InkForum kurulumu')}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="install-root relative min-h-dvh overflow-x-clip bg-[#0d0f14] text-white">
  <div class="install-bg pointer-events-none absolute inset-0" aria-hidden="true"></div>

  <div class="relative mx-auto grid min-h-dvh max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[18rem_1fr] lg:gap-10 lg:py-12">
    <!-- Marka ve adımlar -->
    <aside class="flex flex-col gap-6 lg:sticky lg:top-12 lg:h-fit">
      <div class="flex items-center gap-3">
        <img src="/brand/inkforum-icon-192.png" alt="" class="size-11 rounded-xl shadow-lg ring-1 ring-white/10" />
        <img src="/brand/inkforum-wordmark-light.png" alt="InkForum" class="h-8 w-auto" />
        <LanguagePicker class="ml-auto text-sm text-white/70 hover:text-white" />
      </div>
      <!-- Masaüstü: dikey adımlar -->
      <ol class="hidden gap-1 lg:grid" aria-label={t('Kurulum adımları')}>
        {#each STEPS as s, i (s.key)}
          {@const state = done || i < step ? 'done' : i === step ? 'current' : 'todo'}
          <li class={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors', state === 'current' && 'bg-white/[0.07]')}>
            <span
              class={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300',
                state === 'done' ? 'bg-white text-black' : state === 'current' ? 'bg-white/15 text-white ring-2 ring-white/60' : 'bg-white/5 text-white/40',
              )}
            >
              {#if state === 'done'}<CheckIcon class="size-3.5" weight="bold" />{:else}{i + 1}{/if}
            </span>
            <span class="grid">
              <span class={cn('text-sm font-semibold', state === 'todo' && 'text-white/45')}>{t(s.title)}</span>
              <span class="text-xs text-white/40">{t(s.hint)}</span>
            </span>
          </li>
        {/each}
      </ol>
      <!-- Mobil: ilerleme çubuğu -->
      <div class="grid gap-2 lg:hidden">
        <div class="flex items-center justify-between text-xs text-white/60">
          <span class="font-semibold text-white">{done ? t('Tamamlandı') : t(STEPS[step]!.title)}</span>
          <span>{done ? STEPS.length : step + 1} / {STEPS.length}</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div class="h-full rounded-full bg-white transition-[width] duration-500" style="width:{((done ? STEPS.length : step + 1) / STEPS.length) * 100}%"></div>
        </div>
      </div>
      <p class="hidden text-xs text-white/35 lg:block">InkForum {env ? `v${env.version}` : ''} · {t('Kurulum birkaç dakika sürer.')}</p>
    </aside>

    <!-- İçerik -->
    <main class="min-w-0">
      <div class="install-card overflow-hidden rounded-3xl border border-white/10 bg-[#151821]/90 shadow-2xl backdrop-blur-xl">
        {#if done}
          <section class="grid place-items-center gap-5 px-6 py-16 text-center sm:px-12" in:fade={{ duration: 300 }}>
            <div class="done-badge flex size-20 items-center justify-center rounded-full bg-success/15 text-success ring-8 ring-success/5">
              <CheckIcon class="size-10" weight="bold" />
            </div>
            <div class="grid gap-2">
              <h1 class="text-3xl font-extrabold tracking-tight">{t('{name} hazır!', { name: site.name })}</h1>
              <p class="mx-auto max-w-md text-white/60">{t('Yönetici hesabınla giriş yapıldı. Yönetim panelinden kategorileri, görünümü ve eklentileri dilediğin gibi düzenleyebilirsin.')}</p>
            </div>
            <div class="flex flex-wrap justify-center gap-2">
              <Button href="/admin" size="lg" data-sveltekit-reload class="bg-white text-black hover:bg-white/90"><GaugeIcon />{t('Yönetim paneline git')}</Button>
              <Button href="/" size="lg" variant="outline" data-sveltekit-reload class="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"><HouseIcon />{t('Foruma git')}</Button>
            </div>
          </section>
        {:else}
          {#key step}
            <section class="grid gap-6 p-5 sm:p-8" in:fly={{ x: 24 * dir, duration: 320, easing: cubicOut }}>
              {#if STEPS[step]!.key === 'system'}
                <header class="grid gap-2">
                  <h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl">{t('InkForum’a hoş geldin')}</h1>
                  <p class="text-white/60">{t('Topluluğunu birkaç adımda kuralım. Önce sunucunun hazır olup olmadığına baktık; adres, güvenlik anahtarları ve diğer gerekli ayarlar otomatik yapılır.')}</p>
                </header>
                {#if envError}
                  <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-destructive/15 px-4 py-3 text-sm text-red-300" role="alert">
                    <span>{envError}</span>
                    <Button size="sm" variant="outline" onclick={loadEnvironment} class="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">{t('Tekrar dene')}</Button>
                  </div>
                {:else if !env}
                  <p class="flex items-center gap-2 text-sm text-white/60"><LoaderIcon class="size-4 animate-spin" />{t('Sistem denetleniyor…')}</p>
                {/if}
                <ul class="grid gap-2">
                  {#each checks as c, i (c.key)}
                    {@const Icon = statusIcon(c.status)}
                    <li class="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3" in:fly={{ y: 8, delay: i * 60, duration: 260 }}>
                      <Icon class={cn('mt-0.5 size-5 shrink-0', statusColor(c.status))} weight="fill" />
                      <div class="grid min-w-0">
                        <span class="text-sm font-semibold">{c.label}</span>
                        <span class="text-sm break-words text-white/55">{c.detail}</span>
                      </div>
                    </li>
                  {/each}
                  {#if originMismatch && env}
                    <li class="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
                      <WarningIcon class="mt-0.5 size-5 shrink-0 text-warning" weight="fill" />
                      <div class="grid text-sm">
                        <span class="font-semibold">{t('Adres uyuşmuyor')}</span>
                        <span class="text-white/65">{t('Tarayıcıdaki adres ({origin}) ile APP_URL ({appUrl}) farklı. Giriş ve formlar çalışmayabilir; .env dosyasında APP_URL değerini düzeltip uygulamayı yeniden başlatın.', { origin: window.location.origin, appUrl: env.appUrl })}</span>
                      </div>
                    </li>
                  {/if}
                </ul>
                {#if failed}<p class="rounded-xl bg-destructive/15 px-4 py-3 text-sm text-red-300">{t('Kırmızı işaretli sorunlar giderilmeden kurulum yapılamaz.')}</p>{/if}
              {:else if STEPS[step]!.key === 'site'}
                <header class="grid gap-2">
                  <h1 class="text-2xl font-extrabold tracking-tight">{t('Siten')}</h1>
                  <p class="text-white/60">{t('Ad, açıklama ve görünüm. Hepsi sonradan Yönetim → Görünüm ekranından değiştirilebilir.')}</p>
                </header>
                <div class="grid gap-4 sm:grid-cols-2">
                  <Field label={t('Forum adı')} required error={errors['site.name']} for="s-name">
                    <Input id="s-name" bind:value={site.name} maxlength={60} placeholder={t('Örn. Los Santos Roleplay')} class="install-input" />
                  </Field>
                  <Field label={t('Kısa açıklama')} hint={t('Arama motorlarında ve paylaşım kartlarında görünür.')} for="s-desc">
                    <Input id="s-desc" bind:value={site.description} maxlength={300} placeholder={t('Türkiye’nin en köklü topluluğu')} class="install-input" />
                  </Field>
                </div>
                <div class="grid gap-2">
                  <span class="text-sm font-medium">{t('Tema')}</span>
                  <div class="grid gap-3 sm:grid-cols-2">
                    {#each THEMES as th (th.key)}
                      <button
                        type="button"
                        onclick={() => (site.theme = th.key)}
                        aria-pressed={site.theme === th.key}
                        class={cn('group grid overflow-hidden rounded-2xl border text-left transition-all duration-200', site.theme === th.key ? 'border-white/70 ring-2 ring-white/30' : 'border-white/10 hover:border-white/30')}
                      >
                        <span class="overflow-hidden transition-transform duration-300 group-hover:scale-[1.03]"><ThemePreview theme={th.key} accent={site.accent} mode={site.mode} /></span>
                        <span class="grid gap-0.5 border-t border-white/10 bg-black/30 px-3 py-2.5">
                          <span class="flex items-center gap-1.5 text-sm font-bold">{t(th.label)}{#if site.theme === th.key}<CheckIcon class="size-3.5" weight="bold" />{/if}</span>
                          <span class="text-xs text-white/50">{t(th.hint)}</span>
                        </span>
                      </button>
                    {/each}
                  </div>
                </div>
                <div class="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div class="grid gap-2">
                    <span class="text-sm font-medium">{t('Vurgu rengi')}</span>
                    <div class="flex flex-wrap items-center gap-2">
                      {#each ACCENTS as c (c)}
                        <button type="button" class={cn('size-9 rounded-full ring-offset-2 ring-offset-[#151821] transition-transform hover:scale-110', site.accent === c && 'ring-2 ring-white')} style="background:{c}" onclick={() => (site.accent = c)} aria-label={t('Renk {c}', { c })}></button>
                      {/each}
                      <label class="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-white/30 text-xs text-white/60" title={t('Özel renk')}>
                        <input type="color" bind:value={site.accent} class="absolute inset-0 cursor-pointer opacity-0" />+
                      </label>
                    </div>
                  </div>
                  <div class="grid gap-2">
                    <span class="text-sm font-medium">{t('Varsayılan mod')}</span>
                    <div class="flex rounded-xl bg-black/30 p-1">
                      {#each [['dark', t('Koyu'), MoonIcon], ['light', t('Açık'), SunIcon]] as const as [v, l, I] (v)}
                        <button type="button" class={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors', site.mode === v ? 'bg-white text-black' : 'text-white/60 hover:text-white')} onclick={() => (site.mode = v)}><I class="size-4" />{l}</button>
                      {/each}
                    </div>
                  </div>
                </div>
              {:else if STEPS[step]!.key === 'admin'}
                <header class="grid gap-2">
                  <h1 class="text-2xl font-extrabold tracking-tight">{t('Yönetici hesabı')}</h1>
                  <p class="text-white/60">{t('Bu hesap tüm yetkilere sahip olur. Güçlü ve başka yerde kullanmadığın bir şifre seç.')}</p>
                </header>
                <div class="grid gap-4 sm:grid-cols-2">
                  <Field label={t('Kullanıcı adı')} required error={errors['admin.username']} for="a-user">
                    <Input id="a-user" bind:value={admin.username} maxlength={24} autocomplete="username" class="install-input" />
                  </Field>
                  <Field label={t('E-posta')} required error={errors['admin.email']} for="a-mail">
                    <Input id="a-mail" type="email" bind:value={admin.email} maxlength={200} autocomplete="email" class="install-input" />
                  </Field>
                  <Field label={t('Şifre')} required error={errors['admin.password']} for="a-pw" hint={t('En az 10 karakter; büyük/küçük harf ve rakam.')}>
                    <div class="relative">
                      <Input id="a-pw" type={showPw ? 'text' : 'password'} bind:value={admin.password} maxlength={200} autocomplete="new-password" class="install-input pr-10" />
                      <button type="button" class="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-white/50 hover:text-white" onclick={() => (showPw = !showPw)} aria-label={showPw ? t('Şifreyi gizle') : t('Şifreyi göster')}>
                        {#if showPw}<EyeSlashIcon class="size-4" />{:else}<EyeIcon class="size-4" />{/if}
                      </button>
                    </div>
                    {#if admin.password}
                      <div class="flex items-center gap-2" transition:slide={{ duration: 150 }}>
                        <div class="flex flex-1 gap-1">
                          {#each [0, 1, 2, 3] as i (i)}
                            <span class={cn('h-1.5 flex-1 rounded-full transition-colors', i < strength ? (strength <= 1 ? 'bg-destructive' : strength === 2 ? 'bg-warning' : 'bg-success') : 'bg-white/10')}></span>
                          {/each}
                        </div>
                        <span class="text-xs text-white/55">{t(STRENGTH[strength])}</span>
                      </div>
                    {/if}
                  </Field>
                  <Field label={t('Şifre (tekrar)')} required error={errors['admin.confirm']} for="a-pw2">
                    <Input id="a-pw2" type={showPw ? 'text' : 'password'} bind:value={admin.confirm} maxlength={200} autocomplete="new-password" class="install-input" />
                  </Field>
                </div>
              {:else if STEPS[step]!.key === 'community'}
                <header class="grid gap-2">
                  <h1 class="text-2xl font-extrabold tracking-tight">{t('Topluluk ayarları')}</h1>
                  <p class="text-white/60">{t('Üyelerin nasıl katılacağını ve hangi özelliklerin açık olacağını seç.')}</p>
                </header>
                <div class="grid gap-2">
                  <span class="text-sm font-medium">{t('Kayıt yöntemi')}</span>
                  <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {#each REGISTRATION_MODES as m (m)}
                      <button
                        type="button"
                        onclick={() => (registration = m)}
                        aria-pressed={registration === m}
                        class={cn('grid gap-0.5 rounded-xl border px-3.5 py-3 text-left transition-colors', registration === m ? 'border-white/70 bg-white/10' : 'border-white/10 hover:border-white/30')}
                      >
                        <span class="text-sm font-semibold">{t(REG_INFO[m].label)}</span>
                        <span class="text-xs text-white/50">{t(REG_INFO[m].hint)}</span>
                      </button>
                    {/each}
                  </div>
                </div>
                <div class="grid gap-2">
                  <span class="text-sm font-medium">{t('Eklentiler')}</span>
                  <div class="grid gap-2 sm:grid-cols-2">
                    {#each PLUGINS as p (p.key)}
                      {@const on = plugins.includes(p.key)}
                      {@const Icon = PLUGIN_ICONS[p.key]}
                      <label class={cn('flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors', on ? 'border-white/60 bg-white/[0.07]' : 'border-white/10 hover:border-white/30')}>
                        <Icon class="mt-0.5 size-5 shrink-0 text-white/70" />
                        <span class="grid min-w-0 flex-1 gap-0.5">
                          <span class="text-sm font-semibold">{t(p.name)}</span>
                          <span class="text-xs text-white/50">{t(p.description)}</span>
                        </span>
                        <Switch checked={on} onCheckedChange={(v) => (plugins = v ? [...plugins, p.key] : plugins.filter((k) => k !== p.key))} />
                      </label>
                    {/each}
                  </div>
                </div>
                <label class="flex items-start gap-3 rounded-xl border border-white/10 px-3.5 py-3">
                  <Switch bind:checked={sampleContent} />
                  <span class="grid gap-0.5">
                    <span class="text-sm font-semibold">{t('Örnek kategori ve bölümler oluştur')}</span>
                    <span class="text-xs text-white/50">{t('Duyurular, genel sohbet, yardım gibi hazır bölümler ve bir hoş geldin konusu. Sonradan düzenleyebilir ya da silebilirsin.')}</span>
                  </span>
                </label>
              {:else if STEPS[step]!.key === 'mail'}
                <header class="grid gap-2">
                  <h1 class="text-2xl font-extrabold tracking-tight">{t('E-posta gönderimi')}</h1>
                  <p class="text-white/60">{t('Kayıt doğrulaması, şifre sıfırlama ve bildirimler için. Şimdi atlayıp sonra Yönetim → E-posta ekranından da ayarlayabilirsin.')}</p>
                </header>
                <label class="flex items-center gap-3 rounded-xl border border-white/10 px-3.5 py-3">
                  <Switch bind:checked={mailOn} />
                  <span class="text-sm font-semibold">{t('SMTP ile e-posta gönder')}</span>
                </label>
                {#if mailOn}
                  <div class="grid gap-4" transition:slide={{ duration: 200 }}>
                    <div class="flex flex-wrap gap-1.5">
                      {#each PRESETS as p (p.name)}
                        <button type="button" class={cn('rounded-full border px-3 py-1 text-xs font-semibold transition-colors', mail.host === p.host ? 'border-white bg-white text-black' : 'border-white/20 hover:border-white/50')} onclick={() => ((mail.host = p.host), (mail.port = p.port), (mail.security = p.security))}>{p.name}</button>
                      {/each}
                    </div>
                    <div class="grid gap-4 sm:grid-cols-[1fr_6rem_10rem]">
                      <Field label={t('SMTP sunucusu')} error={errors['mail.host']}><Input bind:value={mail.host} placeholder="smtp.ornek.com" class="install-input" /></Field>
                      <Field label={t('Port')}><Input type="number" bind:value={mail.port} class="install-input" /></Field>
                      <Field label={t('Güvenlik')}>
                        <select bind:value={mail.security} class="install-input h-9 rounded-md border border-white/15 bg-black/30 px-2 text-sm">
                          <option value="starttls">STARTTLS</option>
                          <option value="tls">SSL/TLS</option>
                          <option value="none">{t('Yok')}</option>
                        </select>
                      </Field>
                    </div>
                    <div class="grid gap-4 sm:grid-cols-3">
                      <Field label={t('Kullanıcı adı')}><Input bind:value={mail.user} autocomplete="off" class="install-input" /></Field>
                      <Field label={t('Şifre')}><Input type="password" bind:value={mail.password} autocomplete="new-password" class="install-input" /></Field>
                      <Field label={t('Gönderen adresi')} error={errors.mailFrom}><Input bind:value={mailFrom} placeholder="noreply@ornek.com" class="install-input" /></Field>
                    </div>
                    <div class="flex flex-wrap items-center gap-3">
                      <Button type="button" variant="outline" onclick={testMail} disabled={busy} class="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                        {#if busy}<LoaderIcon class="animate-spin" />{:else}<PlugsIcon />{/if}{t('Bağlantıyı test et')}
                      </Button>
                      {#if mailResult}
                        <span class={cn('flex items-center gap-1.5 text-sm', mailResult.ok ? 'text-success' : 'text-red-300')} in:fade>
                          {#if mailResult.ok}<CheckCircleIcon class="size-4" weight="fill" />{:else}<XCircleIcon class="size-4" weight="fill" />{/if}{mailResult.message}
                        </span>
                      {/if}
                    </div>
                  </div>
                {:else if registration.startsWith('email')}
                  <p class="rounded-xl bg-warning/10 px-4 py-3 text-sm text-amber-200">{t('Kayıt için e-posta doğrulaması seçtin. E-posta ayarlanmazsa doğrulama e-postaları gönderilemez (storage/mail klasörüne yazılır).')}</p>
                {/if}
              {:else}
                <header class="grid gap-2">
                  <h1 class="text-2xl font-extrabold tracking-tight">{t('Her şey hazır')}</h1>
                  <p class="text-white/60">{t('Seçimlerini gözden geçir ve kurulumu başlat.')}</p>
                </header>
                <dl class="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 text-sm sm:grid-cols-2">
                  {#each [
                    [t('Forum'), site.name],
                    [t('Tema'), `${t(THEMES.find((th) => th.key === site.theme)?.label ?? '')} · ${site.mode === 'dark' ? t('koyu') : t('açık')}`],
                    [t('Yönetici'), `${admin.username} · ${admin.email}`],
                    [t('Kayıt'), t(REG_INFO[registration].label)],
                    [t('Eklentiler'), plugins.length ? PLUGINS.filter((p) => plugins.includes(p.key)).map((p) => t(p.name)).join(', ') : t('Yok')],
                    [t('E-posta'), mailOn ? `${mail.host}:${mail.port}` : t('Sonra ayarlanacak')],
                    [t('Örnek içerik'), sampleContent ? t('Oluşturulacak') : t('Boş forum')],
                    [t('Veritabanı'), env?.db === 'postgres' ? 'PostgreSQL' : 'SQLite'],
                  ] as [k, v] (k)}
                    <div class="grid gap-0.5 bg-[#151821] px-4 py-3">
                      <dt class="text-xs text-white/45">{k}</dt>
                      <dd class="font-semibold break-words">{v}</dd>
                    </div>
                  {/each}
                </dl>
                <div class="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                  <span class="size-5 shrink-0 rounded-full" style="background:{site.accent}"></span>
                  <span class="text-white/60">{t('Kurulumdan sonra görünüm, kategoriler ve tüm ayarlar yönetim panelinden değiştirilebilir.')}</span>
                </div>
                {#if errors.install}<p class="rounded-xl bg-destructive/15 px-4 py-3 text-sm text-red-300" role="alert">{errors.install}</p>{/if}
              {/if}

              <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
                {#if step > 0}
                  <Button variant="ghost" onclick={() => go(step - 1)} disabled={busy} class="text-white/70 hover:bg-white/10 hover:text-white"><ArrowLeftIcon />{t('Geri')}</Button>
                {:else}
                  <span></span>
                {/if}
                {#if STEPS[step]!.key === 'finish'}
                  <Button size="lg" onclick={install} disabled={busy} class="bg-white text-black hover:bg-white/90">
                    {#if busy}<LoaderIcon class="animate-spin" />{t('Kuruluyor…')}{:else}<RocketIcon />{t('Kurulumu tamamla')}{/if}
                  </Button>
                {:else}
                  <Button size="lg" onclick={next} disabled={busy || (STEPS[step]!.key === 'system' && (!env || failed))} class="bg-white text-black hover:bg-white/90">
                    {STEPS[step]!.key === 'mail' && !mailOn ? t('Şimdilik atla') : STEPS[step]!.key === 'system' ? t('Başlayalım') : t('Devam et')}<ArrowRightIcon />
                  </Button>
                {/if}
              </footer>
            </section>
          {/key}
        {/if}
      </div>
    </main>
  </div>
</div>

<style>
  /* Mürekkep lekesi ve kontur çizgileri: sade, koyu, markaya uygun arka plan */
  .install-bg {
    background:
      radial-gradient(60rem 40rem at -10% -10%, rgb(255 255 255 / 0.07), transparent 60%),
      radial-gradient(50rem 36rem at 110% 10%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 65%),
      radial-gradient(40rem 30rem at 50% 120%, rgb(255 255 255 / 0.05), transparent 60%);
  }
  .install-bg::after {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.35;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.07'%3E%3Cpath d='M-50 120c80-60 160 40 260-10s150-90 240-20 140 40 200 0'/%3E%3Cpath d='M-50 160c90-50 170 40 260 0s160-80 250-10 130 40 190 10'/%3E%3Cpath d='M-50 200c100-40 170 30 270 0s150-70 240-10 140 30 190 10'/%3E%3Cpath d='M-50 330c70-40 150 50 250 10s160-60 250 0 150 40 200 10'/%3E%3Cpath d='M-50 370c80-40 160 40 260 10s150-60 240 0 140 30 200 0'/%3E%3Cpath d='M-50 480c90-30 170 40 260 10s160-50 250 0 140 30 190 10'/%3E%3Cpath d='M-50 520c100-30 170 30 270 10s150-50 240 0 130 20 190 0'/%3E%3C/g%3E%3C/svg%3E");
    background-size: 600px 600px;
    mask-image: radial-gradient(ellipse at 30% 20%, black 20%, transparent 75%);
  }
  .install-card {
    animation: install-in 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @keyframes install-in {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.985);
    }
  }
  .done-badge {
    animation: done-pop 700ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
  }
  @keyframes done-pop {
    from {
      transform: scale(0.4);
      opacity: 0;
    }
  }
  .install-root :global(.install-input) {
    border-color: rgb(255 255 255 / 0.15);
    background: rgb(0 0 0 / 0.3);
    color: white;
  }
  .install-root :global(.install-input:focus-visible) {
    border-color: rgb(255 255 255 / 0.5);
  }
  @media (prefers-reduced-motion: reduce) {
    .install-card,
    .done-badge {
      animation: none;
    }
  }
</style>
