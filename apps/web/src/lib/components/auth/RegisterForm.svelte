<script lang="ts">
  import type { RegisterResult } from '@forum/shared';
  import { onMount } from 'svelte';
  import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotch';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import Captcha from './Captcha.svelte';
  import PasswordStrength from '$lib/components/PasswordStrength.svelte';
  import PolicyCheckList from '$lib/components/PolicyCheckList.svelte';
  import CustomFieldInput from '$lib/components/CustomFieldInput.svelte';
  import { api, errorMessage } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';
  import type { RegisterInfo } from '$lib/types';

  interface Props {
    info?: RegisterInfo | null;
    ondone: (res: RegisterResult, email: string) => void | Promise<void>;
    idPrefix?: string;
    compact?: boolean;
  }
  let { info: initial = null, ondone, idPrefix = 'reg', compact = false }: Props = $props();

  let loaded = $state<RegisterInfo | null>(null);
  let loadError = $state<string | null>(null);
  const info = $derived(initial ?? loaded);

  let username = $state('');
  let displayName = $state('');
  let email = $state('');
  let password = $state('');
  let passwordConfirm = $state('');
  let birthdate = $state('');
  let website = $state('');
  let captcha = $state('');
  let captchaBox = $state<{ reset: () => void } | null>(null);
  let accepted = $state<number[]>([]);
  let customFields = $state<Record<string, string>>({});
  let formStartedAt = 0;

  const form = createForm();

  onMount(() => {
    formStartedAt = Date.now();
    if (!initial) {
      api
        .get<RegisterInfo>('/api/auth/register')
        .then((r) => (loaded = r))
        .catch((e) => (loadError = errorMessage(e)));
    }
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    form.clear();
    if (password !== passwordConfirm) {
      form.setError('passwordConfirm', t('Şifreler eşleşmiyor.'));
      return;
    }
    const res = await form.submit(() =>
      api.post<RegisterResult>('/api/auth/register', {
        username,
        displayName,
        email,
        password,
        birthdate,
        acceptedPolicyVersionIds: accepted,
        customFields,
        website,
        formStartedAt,
        captcha: captcha || undefined,
      }),
    );
    if (!res) {
      captchaBox?.reset();
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    await ondone(res, email);
  }

  const maxBirth = new Date().toISOString().slice(0, 10);
  const cols = $derived(compact ? '' : 'sm:grid-cols-2');
</script>

{#if loadError}
  <FormMessage message={loadError} />
{:else if !info}
  <div class="flex h-48 items-center justify-center"><CircleNotchIcon class="size-6 animate-spin text-muted-foreground" /></div>
{:else if info.mode === 'closed'}
  <p class="rounded-xl border bg-muted p-4 text-sm text-muted-foreground">{t('Şu anda yeni üye kabul edilmiyor. Lütfen daha sonra tekrar deneyin.')}</p>
{:else}
  <form class="grid gap-4" onsubmit={submit} novalidate>
    {#if info.mode !== 'open'}
      <p class="rounded-xl bg-primary-soft px-3 py-2 text-xs text-foreground/80">
        {info.mode === 'email'
          ? t('Kayıttan sonra e-posta adresinizi doğrulamanız gerekecek.')
          : t('Üyeliğiniz yöneticiler tarafından onaylandıktan sonra etkinleşecek.')}
      </p>
    {/if}
    <FormMessage message={form.message} />

    <div class="grid gap-4 {cols}">
      <Field
        label={t('Kullanıcı adı')}
        for="{idPrefix}-username"
        required
        error={form.error('username')}
        hint={t('{min}-{max} karakter; harf, rakam, boşluk, _ . -', { min: info.usernameMinLength, max: info.usernameMaxLength })}
      >
        <Input id="{idPrefix}-username" bind:value={username} autocomplete="username" maxlength={info.usernameMaxLength} aria-invalid={!!form.error('username')} />
      </Field>
      <Field label={t('Görünen ad')} for="{idPrefix}-displayName" error={form.error('displayName')} hint={t('Boş bırakırsanız kullanıcı adınız kullanılır.')}>
        <Input id="{idPrefix}-displayName" bind:value={displayName} maxlength={40} aria-invalid={!!form.error('displayName')} />
      </Field>
    </div>

    <Field label={t('E-posta adresi')} for="{idPrefix}-email" required error={form.error('email')} hint={t('Diğer üyelere gösterilmez.')}>
      <Input id="{idPrefix}-email" type="email" bind:value={email} autocomplete="email" aria-invalid={!!form.error('email')} />
    </Field>

    <div class="grid gap-4 {cols}">
      <Field
        label={t('Şifre')}
        for="{idPrefix}-password"
        required
        error={form.error('password')}
        hint={info.passwordRequireMixed
          ? t('En az {n} karakter, harf ve rakam içermeli.', { n: info.passwordMinLength })
          : t('En az {n} karakter.', { n: info.passwordMinLength })}
      >
        <Input id="{idPrefix}-password" type="password" bind:value={password} autocomplete="new-password" aria-invalid={!!form.error('password')} />
        <PasswordStrength {password} />
      </Field>
      <Field label={t('Şifre (tekrar)')} for="{idPrefix}-passwordConfirm" required error={form.error('passwordConfirm')}>
        <Input id="{idPrefix}-passwordConfirm" type="password" bind:value={passwordConfirm} autocomplete="new-password" aria-invalid={!!form.error('passwordConfirm')} />
      </Field>
    </div>

    {#if info.requireBirthdate || info.minAge > 0}
      <Field
        label={t('Doğum tarihi')}
        for="{idPrefix}-birthdate"
        required={info.requireBirthdate}
        error={form.error('birthdate')}
        hint={info.minAge > 0 ? t('Kayıt için en az {age} yaşında olmalısınız.', { age: info.minAge }) : null}
      >
        <Input id="{idPrefix}-birthdate" type="date" bind:value={birthdate} max={maxBirth} aria-invalid={!!form.error('birthdate')} />
      </Field>
    {/if}

    {#each info.customFields as field (field.key)}
      <CustomFieldInput {field} bind:value={customFields[field.key]} error={form.error(`customFields.${field.key}`)} />
    {/each}

    <!-- Bot tuzağı: gerçek kullanıcılar bu alanı görmez -->
    <div class="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
      <label>Web siteniz <input type="text" tabindex="-1" autocomplete="off" bind:value={website} /></label>
    </div>

    {#if info.policies.length}
      <PolicyCheckList policies={info.policies} bind:accepted errors={form.errors} />
    {/if}

    <Captcha form="register" bind:value={captcha} bind:this={captchaBox} error={form.error('captcha')} />
    <Button type="submit" size="lg" disabled={form.submitting} class="press mt-1">{form.submitting ? t('Kaydediliyor…') : t('Hesabımı oluştur')}</Button>
  </form>
{/if}
