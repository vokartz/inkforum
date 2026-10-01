<script lang="ts">
  import { SOCIAL_PROVIDERS, type RegisterResult } from '@forum/shared';
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotch';
  import SealCheckIcon from 'phosphor-svelte/lib/SealCheck';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import PolicyCheckList from '$lib/components/PolicyCheckList.svelte';
  import BrandIcon from '$lib/components/BrandIcon.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { safeNext } from '$lib/nav';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const p = $derived(data.pending);
  const label = $derived(SOCIAL_PROVIDERS.find((x) => x.key === p?.provider)?.label ?? '');
  let username = $state(untrack(() => data.pending?.suggestedUsername ?? ''));
  let email = $state('');
  let accepted = $state<number[]>([]);
  const form = createForm();

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const res = await form.submit(() =>
      api.post<{ status: RegisterResult['status'] }>('/api/auth/social/complete', { username, acceptedPolicyVersionIds: accepted, ...(p?.email ? {} : { email }) }),
    );
    if (!res) return;
    if (res.status === 'active') {
      await invalidateAll();
      await goto(safeNext(page.url.searchParams.get('next')), { replaceState: true });
    } else {
      await goto(`/register/done?status=${res.status}&email=${encodeURIComponent(p?.email ?? email)}`, { replaceState: true });
    }
  }
</script>

{#if !p}
  <AuthCard showcase title={t('Oturum süresi doldu')} description={t('Sosyal hesapla kayıt adımı zaman aşımına uğradı ya da bulunamadı.')}>
    <Button href="/register" class="w-full">{t('Kayıt sayfasına dön')}</Button>
  </AuthCard>
{:else}
  <AuthCard showcase title={t('Son bir adım')} description={t('{label} hesabınla kayıt oluyorsun; forumda görünecek kullanıcı adını seç.', { label })}>
    <form class="grid gap-4" onsubmit={submit}>
      <div class="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
        {#if p.avatarUrl}<img src={p.avatarUrl} alt="" class="size-11 rounded-full object-cover" referrerpolicy="no-referrer" />{:else}<BrandIcon platform={p.provider} badge size={18} />{/if}
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold">{p.displayName ?? p.suggestedUsername}</p>
          <p class="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <BrandIcon platform={p.provider} size={12} />{label}{#if p.email} · {p.email}{#if p.emailVerified}<SealCheckIcon class="size-3.5 text-success" weight="fill" />{/if}{/if}
          </p>
        </div>
      </div>
      <FormMessage message={form.message} />
      <Field
        label={t('Kullanıcı adı')}
        for="s-username"
        error={form.error('username')}
        hint={t('{min}–{max} karakter; sonradan değiştirme sınırlı olabilir.', { min: data.info.usernameMinLength, max: data.info.usernameMaxLength })}
      >
        <Input id="s-username" bind:value={username} required autofocus class="h-11" />
      </Field>
      {#if !p.email}
        <Field label={t('E-posta')} for="s-email" error={form.error('email')} hint={t('{label} e-posta adresini paylaşmadı; doğrulama bağlantısı bu adrese gönderilecek.', { label })}>
          <Input id="s-email" type="email" bind:value={email} required class="h-11" />
        </Field>
      {:else if form.error('email')}
        <p class="text-sm text-destructive">{form.error('email')}</p>
      {/if}
      {#if data.info.policies.length}
        <PolicyCheckList policies={data.info.policies} bind:accepted errors={form.errors} />
      {/if}
      <Button type="submit" size="lg" class="press" disabled={form.submitting || !username.trim()}>
        {#if form.submitting}<CircleNotchIcon class="animate-spin" />{/if}{t('Hesabı oluştur')}
      </Button>
      <p class="text-center text-xs text-muted-foreground">{t('Şifre gerekmez; dilersen daha sonra Ayarlar → Şifre bölümünden bir şifre belirleyebilirsin.')}</p>
    </form>
  </AuthCard>
{/if}
