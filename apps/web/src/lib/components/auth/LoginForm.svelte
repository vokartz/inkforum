<script lang="ts">
  import type { LoginResult } from '@forum/shared';
  import { untrack } from 'svelte';
  import EyeIcon from 'phosphor-svelte/lib/Eye';
  import EyeOffIcon from 'phosphor-svelte/lib/EyeSlash';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheck';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Label } from '$lib/components/ui/label';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import Captcha from './Captcha.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    /** Başarılı girişten sonra */
    ondone: () => void | Promise<void>;
    /** Kimlik alanına otomatik odaklan */
    autofocus?: boolean;
    idPrefix?: string;
    /** Sosyal girişten iki adımlı doğrulamaya devam */
    initialChallenge?: string | null;
  }
  let { ondone, autofocus = false, idPrefix = 'login', initialChallenge = null }: Props = $props();

  let identifier = $state('');
  let password = $state('');
  let remember = $state(false);
  let show = $state(false);
  let challenge = $state<string | null>(untrack(() => initialChallenge));
  let code = $state('');
  let pendingEmail = $state<string | null>(null);
  let resent = $state(false);
  let captcha = $state('');
  let captchaBox = $state<{ reset: () => void } | null>(null);

  const form = createForm();

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    pendingEmail = null;
    const res = await form.submit(() => api.post<LoginResult>('/api/auth/login', { identifier, password, remember, captcha: captcha || undefined }), {
      onError: (err) => {
        if (err.code === 'ACCOUNT_PENDING_EMAIL') pendingEmail = String(err.details.email ?? '');
      },
    });
    if (!res) {
      captchaBox?.reset();
      return;
    }
    if (res.status === 'two_factor_required' && res.challenge) {
      challenge = res.challenge;
      return;
    }
    await ondone();
  }

  async function submitCode(e: SubmitEvent) {
    e.preventDefault();
    const res = await form.submit(() => api.post<LoginResult>('/api/auth/login/2fa', { challenge, code }), {
      onError: (err) => {
        if (err.code === 'TOKEN_INVALID') {
          challenge = null;
          code = '';
        }
      },
    });
    if (res) await ondone();
  }

  async function resend() {
    if (!pendingEmail) return;
    await api.post('/api/auth/verify-email/resend', { email: pendingEmail }).catch(() => undefined);
    resent = true;
  }
</script>

{#if challenge}
  <form class="grid gap-4 animate-rise" onsubmit={submitCode}>
    <div class="flex items-center gap-3 rounded-xl border bg-primary-soft p-3 text-sm">
      <ShieldCheckIcon class="size-6 shrink-0 text-primary" weight="duotone" />
      <span>{t('Doğrulama uygulamanızdaki 6 haneli kodu veya bir kurtarma kodunu girin.')}</span>
    </div>
    <FormMessage message={form.message} />
    <Field label={t('Doğrulama kodu')} for="{idPrefix}-code" error={form.error('code')}>
      <Input
        id="{idPrefix}-code"
        bind:value={code}
        autocomplete="one-time-code"
        autofocus
        placeholder="123456"
        class="h-12 text-center font-mono text-xl tracking-[0.4em]"
      />
    </Field>
    <Button type="submit" size="lg" disabled={form.submitting || !code}>{form.submitting ? t('Doğrulanıyor…') : t('Doğrula')}</Button>
    <Button variant="ghost" onclick={() => ((challenge = null), (code = ''))}>{t('Geri dön')}</Button>
  </form>
{:else}
  <form class="grid gap-4" onsubmit={submit}>
    <FormMessage message={form.message} />
    {#if pendingEmail !== null}
      <div class="rounded-xl border bg-muted p-3 text-sm">
        {#if resent}
          {t('Doğrulama e-postası tekrar gönderildi. Gelen kutunuzu kontrol edin.')}
        {:else}
          {t('Doğrulama e-postasını almadınız mı?')}
          <button type="button" class="font-semibold text-link underline" onclick={resend}>{t('Tekrar gönder')}</button>
        {/if}
      </div>
    {/if}
    <Field label={t('Kullanıcı adı veya e-posta')} for="{idPrefix}-identifier" error={form.error('identifier')}>
      <Input id="{idPrefix}-identifier" bind:value={identifier} autocomplete="username" required {autofocus} class="h-11" />
    </Field>
    <Field label={t('Şifre')} for="{idPrefix}-password" error={form.error('password')}>
      <div class="relative">
        <Input id="{idPrefix}-password" type={show ? 'text' : 'password'} bind:value={password} autocomplete="current-password" required class="h-11 pr-11" />
        <button
          type="button"
          class="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={show ? t('Şifreyi gizle') : t('Şifreyi göster')}
          onclick={() => (show = !show)}
        >
          {#if show}<EyeOffIcon class="size-4" />{:else}<EyeIcon class="size-4" />{/if}
        </button>
      </div>
    </Field>
    <Captcha form="login" bind:value={captcha} bind:this={captchaBox} error={form.error('captcha')} />
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Checkbox id="{idPrefix}-remember" bind:checked={remember} />
        <Label for="{idPrefix}-remember" class="font-normal">{t('Beni hatırla')}</Label>
      </div>
      <a href="/forgot-password" class="text-sm font-medium text-link hover:underline">{t('Şifremi unuttum')}</a>
    </div>
    <Button type="submit" size="lg" class="press" disabled={form.submitting}>{form.submitting ? t('Giriş yapılıyor…') : t('Giriş yap')}</Button>
  </form>
{/if}
