<script lang="ts">
  import { API_SCOPE_INFO, OAUTH_SCOPES, type AdminOAuthClient, type OAuthClientInput } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import AppWindowIcon from 'phosphor-svelte/lib/AppWindow';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import KeyIcon from 'phosphor-svelte/lib/Key';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import SealCheckIcon from 'phosphor-svelte/lib/SealCheck';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import Field from '$lib/components/Field.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDate } from '$lib/format';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';
  import SecretDialog from './SecretDialog.svelte';

  let { clients, metadata }: { clients: AdminOAuthClient[]; metadata: { authorization_endpoint: string; token_endpoint: string; userinfo_endpoint: string } } = $props();

  const blank = (): OAuthClientInput => ({ name: '', description: '', homepageUrl: null, logoUrl: null, redirectUris: [''], scopes: ['profile'], isConfidential: true, isTrusted: false, isEnabled: true });
  let open = $state(false);
  let editId = $state<number | null>(null);
  let editClientId = $state('');
  let form = $state<OAuthClientInput>(blank());
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);
  let secrets = $state<Array<{ label: string; value: string }> | null>(null);

  function openNew() {
    editId = null;
    form = blank();
    errors = {};
    open = true;
  }
  function openEdit(c: AdminOAuthClient) {
    editId = c.id;
    editClientId = c.clientId;
    form = { name: c.name, description: c.description, homepageUrl: c.homepageUrl, logoUrl: c.logoUrl, redirectUris: [...c.redirectUris], scopes: [...c.scopes], isConfidential: c.isConfidential, isTrusted: c.isTrusted, isEnabled: c.isEnabled };
    errors = {};
    open = true;
  }
  function toggleScope(s: (typeof OAUTH_SCOPES)[number], on: boolean) {
    form.scopes = on ? [...new Set([...form.scopes, s])] : form.scopes.filter((x) => x !== s);
  }
  async function save() {
    saving = true;
    errors = {};
    try {
      const body = { ...form, redirectUris: form.redirectUris.map((u) => u.trim()).filter(Boolean), homepageUrl: form.homepageUrl?.trim() || null, logoUrl: form.logoUrl?.trim() || null };
      if (editId) {
        await api.put(`/api/admin/developers/clients/${editId}`, body);
        toast.success(t('Uygulama güncellendi.'));
      } else {
        const res = await api.post<{ client: AdminOAuthClient; secret: string | null }>('/api/admin/developers/clients', body);
        secrets = [{ label: 'client_id', value: res.client.clientId }, ...(res.secret ? [{ label: 'client_secret', value: res.secret }] : [])];
      }
      open = false;
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
  async function rotate(c: AdminOAuthClient) {
    if (!(await confirmAction({
        title: t('Gizli anahtar yenilensin mi?'),
        description: t('Eski anahtar hemen geçersiz olur; uygulamanın sunucusunda da güncellemen gerekir.'),
        confirmLabel: t('Yenile'),
        destructive: true,
      }))) return;
    try {
      const res = await api.post<{ secret: string }>(`/api/admin/developers/clients/${c.id}/secret`);
      secrets = [{ label: 'client_id', value: c.clientId }, { label: 'client_secret', value: res.secret }];
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function remove(c: AdminOAuthClient) {
    if (!(await confirmAction({
        title: t('{name} silinsin mi?', { name: c.name }),
        description: t('Tüm üyelerin bu uygulamaya verdiği izinler ve belirteçler silinir.'),
        confirmLabel: t('Sil'),
        destructive: true,
      }))) return;
    try {
      await api.delete(`/api/admin/developers/clients/${c.id}`);
      open = false;
      await invalidate('app:admin-developers');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function copy(v: string) {
    try {
      await navigator.clipboard.writeText(v);
      toast.success(t('Kopyalandı.'));
    } catch {
      /* yok */
    }
  }
</script>

<div class="grid gap-4">
  <div class="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
    <div class="min-w-0 flex-1">
      <h2 class="font-bold">{t('OAuth 2.0 uygulamaları')}</h2>
      <p class="text-sm text-muted-foreground">{t('UCP, oyun paneli ya da başka bir site "Forum hesabıyla giriş yap" düğmesi koyabilir; üye izin verince uygulama, üye adına API\'yi kullanır.')}</p>
    </div>
    <Button onclick={openNew}><PlusIcon weight="bold" />{t('Yeni uygulama')}</Button>
  </div>

  {#if clients.length}
    <div class="grid gap-3 lg:grid-cols-2">
      {#each clients as c (c.id)}
        <button type="button" onclick={() => openEdit(c)} class={cn('flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary', !c.isEnabled && 'opacity-60')}>
          {#if c.logoUrl}<img src={c.logoUrl} alt="" class="size-11 rounded-lg object-cover" />{:else}<span class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><AppWindowIcon class="size-6" /></span>{/if}
          <span class="grid min-w-0 flex-1 gap-1">
            <span class="flex items-center gap-2 font-bold">{c.name}{#if c.isTrusted}<SealCheckIcon class="size-4 text-primary" weight="fill" aria-label={t('Birinci taraf')} />{/if}{#if !c.isEnabled}<span class="rounded bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">{t('KAPALI')}</span>{/if}</span>
            <span class="truncate font-mono text-xs text-muted-foreground">{c.clientId}</span>
            <span class="flex flex-wrap gap-1">{#each c.scopes as s (s)}<span class="rounded bg-primary-soft px-1.5 py-px text-[11px] font-semibold text-highlight">{s}</span>{/each}</span>
            <span class="text-xs text-muted-foreground">{t('{n} üye izin verdi', { n: c.activeUsers })} · {c.isConfidential ? t('Sunucu uygulaması') : t('Genel (PKCE)')} · {formatDate(c.createdAt)}</span>
          </span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="rounded-xl border border-dashed bg-card px-4 py-10 text-center text-sm text-muted-foreground">{t('Henüz uygulama yok. İlk uygulamanı oluşturup UCP\'nde "Forum ile giriş" düğmesini kullanabilirsin.')}</p>
  {/if}

  <div class="grid gap-2 rounded-xl border bg-muted/20 p-4 text-sm">
    <p class="font-semibold">{t('Uç noktalar')}</p>
    {#each [[t('Yetkilendirme'), metadata.authorization_endpoint], [t('Belirteç'), metadata.token_endpoint], [t('Üye bilgisi'), metadata.userinfo_endpoint]] as [l, u] (l)}
      <div class="flex items-center gap-2"><span class="w-28 shrink-0 text-xs text-muted-foreground">{l}</span><code class="min-w-0 flex-1 truncate font-mono text-xs">{u}</code><Button variant="ghost" size="icon-sm" aria-label={t('Kopyala')} onclick={() => copy(u!)}><CopyIcon /></Button></div>
    {/each}
    <a href="/developers" target="_blank" class="text-xs font-semibold text-link hover:underline">{t('Geliştirici belgelerini aç →')}</a>
  </div>
</div>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="w-full gap-0 data-[side=right]:sm:max-w-xl">
    <Sheet.Header class="border-b">
      <Sheet.Title>{editId ? t('Uygulamayı düzenle') : t('Yeni OAuth uygulaması')}</Sheet.Title>
      {#if editId}<Sheet.Description class="font-mono text-xs">{editClientId}</Sheet.Description>{/if}
    </Sheet.Header>
    <div class="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">
      <Field label={t('Uygulama adı')} error={errors.name} hint={t('Üyeye onay ekranında gösterilir.')}><Input bind:value={form.name} maxlength={60} placeholder={t('ör. Sunucu UCP')} /></Field>
      <Field label={t('Açıklama')}><Textarea bind:value={form.description} rows={2} maxlength={300} /></Field>
      <div class="grid gap-4 sm:grid-cols-2">
        <Field label={t('Web sitesi')} error={errors.homepageUrl}><Input bind:value={form.homepageUrl} placeholder="https://ucp.ornek.com" /></Field>
        <Field label={t('Logo adresi')} error={errors.logoUrl}><Input bind:value={form.logoUrl} placeholder="https://…/logo.png" /></Field>
      </div>
      <div class="grid gap-2">
        <span class="text-sm font-semibold">{t('Yönlendirme adresleri')}</span>
        {#each form.redirectUris as _, i (i)}
          <div class="flex gap-2">
            <Input bind:value={form.redirectUris[i]} placeholder="https://ucp.ornek.com/auth/forum/callback" class="font-mono text-xs" aria-invalid={!!errors[`redirectUris.${i}`]} />
            <Button variant="ghost" size="icon" aria-label={t('Kaldır')} disabled={form.redirectUris.length <= 1} onclick={() => (form.redirectUris = form.redirectUris.filter((__, j) => j !== i))}><TrashIcon /></Button>
          </div>
          {#if errors[`redirectUris.${i}`]}<p class="text-xs text-destructive">{errors[`redirectUris.${i}`]}</p>{/if}
        {/each}
        {#if errors.redirectUris}<p class="text-xs text-destructive">{errors.redirectUris}</p>{/if}
        <Button variant="outline" size="sm" class="justify-self-start" disabled={form.redirectUris.length >= 10} onclick={() => (form.redirectUris = [...form.redirectUris, ''])}><PlusIcon />{t('Adres ekle')}</Button>
        <p class="text-xs text-muted-foreground">{t('Yetkilendirmeden sonra yalnızca bu adreslere (birebir eşleşme) dönülür.')}</p>
      </div>
      <div class="grid gap-2">
        <span class="text-sm font-semibold">{t('İzinler')}</span>
        {#each OAUTH_SCOPES as s (s)}
          <label class="flex items-start gap-3 rounded-md border p-2.5 text-sm">
            <Checkbox checked={form.scopes.includes(s)} onCheckedChange={(v) => toggleScope(s, v === true)} class="mt-0.5" />
            <span class="grid"><span class="font-semibold">{t(API_SCOPE_INFO[s].label)} <code class="ml-1 text-[11px] font-normal text-muted-foreground">{s}</code></span><span class="text-xs text-muted-foreground">{t(API_SCOPE_INFO[s].description)}</span></span>
          </label>
        {/each}
        {#if errors.scopes}<p class="text-xs text-destructive">{errors.scopes}</p>{/if}
      </div>
      <div class="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
        <label class="flex items-start justify-between gap-3"><span><b>{t('Sunucu uygulaması')}</b><span class="block text-xs text-muted-foreground">{t('Gizli anahtar kullanır. Kapalıysa (tarayıcı/mobil) PKCE zorunludur.')}</span></span><Switch bind:checked={form.isConfidential} /></label>
        <label class="flex items-start justify-between gap-3"><span><b>{t('Birinci taraf (güvenilir)')}</b><span class="block text-xs text-muted-foreground">{t("Onay ekranı gösterilmez; kendi UCP'n gibi resmi uygulamalar için.")}</span></span><Switch bind:checked={form.isTrusted} /></label>
        <label class="flex items-center justify-between gap-3"><b>{t('Etkin')}</b><Switch bind:checked={form.isEnabled} /></label>
      </div>
    </div>
    <Sheet.Footer class="flex-row flex-wrap justify-between gap-2 border-t">
      <div class="flex gap-2">
        {#if editId}
          {@const c = clients.find((x) => x.id === editId)}
          {#if c?.isConfidential}<Button variant="outline" size="sm" onclick={() => c && rotate(c)}><KeyIcon />{t('Anahtarı yenile')}</Button>{/if}
          <Button variant="ghost" size="sm" class="text-destructive" onclick={() => c && remove(c)}><TrashIcon />{t('Sil')}</Button>
        {/if}
      </div>
      <div class="flex gap-2">
        <Button variant="ghost" onclick={() => (open = false)}>{t('Vazgeç')}</Button>
        <Button onclick={save} disabled={saving || form.name.trim().length < 2}>{#if saving}<LoaderIcon class="animate-spin" />{/if}{editId ? t('Kaydet') : t('Oluştur')}</Button>
      </div>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>

<SecretDialog
  title={t('Uygulama kimlik bilgileri')}
  bind:items={secrets}
  note={t('client_secret yalnızca sunucu tarafında kullanılmalı; tarayıcı koduna ya da mobil uygulamaya gömülmemeli.')}
/>
