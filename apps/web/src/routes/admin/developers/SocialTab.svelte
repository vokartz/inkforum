<script lang="ts">
  import type { AdminSocialProvider } from '@forum/shared';
  import { untrack } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import Field from '$lib/components/Field.svelte';
  import BrandIcon from '$lib/components/BrandIcon.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { t } from '$lib/i18n.svelte';

  let { social }: { social: AdminSocialProvider[] } = $props();

  const CONSOLES: Record<string, { url: string; steps: string }> = {
    discord: { url: 'https://discord.com/developers/applications', steps: 'Uygulama oluştur → OAuth2 → Redirects bölümüne dönüş adresini ekle; Client ID ve Client Secret\'ı buraya yapıştır.' },
    google: { url: 'https://console.cloud.google.com/apis/credentials', steps: 'OAuth istemci kimliği (Web uygulaması) oluştur → Yetkili yönlendirme URI\'lerine dönüş adresini ekle.' },
    github: { url: 'https://github.com/settings/developers', steps: 'New OAuth App → Authorization callback URL alanına dönüş adresini yaz.' },
  };

  let form = $state(untrack(() => Object.fromEntries(social.map((p) => [p.key, { enabled: p.enabled, clientId: p.clientId, clientSecret: '' }]))));
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);

  async function save() {
    saving = true;
    errors = {};
    try {
      await api.put('/api/admin/developers/social', form);
      toast.success(t('Sosyal giriş ayarları kaydedildi.'));
      for (const k of Object.keys(form)) form[k]!.clientSecret = '';
      await invalidate('app:admin-developers');
    } catch (e) {
      if (e instanceof ApiError) {
        errors = e.fields;
        toast.error(Object.values(e.fields)[0] ?? e.message);
      } else toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }
  async function copy(v: string) {
    try {
      await navigator.clipboard.writeText(v);
      toast.success(t('Kopyalandı.'));
    } catch {
    }
  }
</script>

<div class="grid gap-4">
  <div class="rounded-xl border bg-card p-4">
    <h2 class="font-bold">{t('Sosyal giriş')}</h2>
    <p class="text-sm text-muted-foreground">{t('Üyeler Discord, Google ya da GitHub hesabıyla tek tıkla giriş yapabilir, kayıt olabilir ve mevcut hesaplarını bağlayabilir. Aynı e-postalı hesaplar güvenlik gereği otomatik birleştirilmez.')}</p>
  </div>
  {#each social as p (p.key)}
    <section class="overflow-hidden rounded-xl border bg-card">
      <header class="flex items-center gap-3 border-b px-4 py-3">
        <BrandIcon platform={p.key} badge size={16} />
        <div class="min-w-0 flex-1">
          <p class="font-bold">{p.label}</p>
          <p class="text-xs text-muted-foreground">{form[p.key]?.enabled ? t('Etkin') : t('Kapalı')}{p.hasSecret ? ` · ${t('gizli anahtar kayıtlı')}` : ''}</p>
        </div>
        <Switch bind:checked={form[p.key]!.enabled} aria-label={t('{name} etkin', { name: p.label })} />
      </header>
      <div class="grid gap-3 p-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <Field label="Client ID" error={errors[`${p.key}.clientId`]}><Input bind:value={form[p.key]!.clientId} class="font-mono text-xs" /></Field>
          <Field label="Client Secret" hint={p.hasSecret ? t('Değiştirmek istemiyorsan boş bırak.') : ''}>
            <Input type="password" bind:value={form[p.key]!.clientSecret} placeholder={p.hasSecret ? '••••••••••' : ''} class="font-mono text-xs" autocomplete="off" />
          </Field>
        </div>
        <div class="grid gap-1 rounded-md bg-muted/40 p-3 text-xs">
          <span class="font-semibold">{t('Dönüş (callback) adresi')}</span>
          <div class="flex items-center gap-2"><code class="min-w-0 flex-1 truncate font-mono">{p.callbackUrl}</code><Button variant="ghost" size="icon-sm" aria-label={t('Kopyala')} onclick={() => copy(p.callbackUrl)}><CopyIcon /></Button></div>
          <span class="text-muted-foreground">{CONSOLES[p.key] ? t(CONSOLES[p.key]!.steps) : ''}</span>
          <a href={CONSOLES[p.key]?.url} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-semibold text-link hover:underline">{t('Geliştirici konsolunu aç')} <ArrowSquareOutIcon class="size-3.5" /></a>
        </div>
      </div>
    </section>
  {/each}
  <div><Button onclick={save} disabled={saving}>{#if saving}<LoaderIcon class="animate-spin" />{/if}{t('Kaydet')}</Button></div>
</div>
