<script lang="ts">
  import type { AdminExtension, ExtensionPackagePreview } from '@forum/shared';
  import { toast } from 'svelte-sonner';
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import NpmIcon from 'phosphor-svelte/lib/Package';
  import FileZipIcon from 'phosphor-svelte/lib/FileZip';
  import WarningIcon from 'phosphor-svelte/lib/Warning';
  import ShieldWarningIcon from 'phosphor-svelte/lib/ShieldWarning';
  import CheckIcon from 'phosphor-svelte/lib/CheckCircle';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import Field from '$lib/components/Field.svelte';
  import { api, errorMessage } from '$lib/api';
  import { fileSize as formatBytes } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { open = $bindable(false), onInstalled }: { open?: boolean; onInstalled?: (e: AdminExtension) => void | Promise<void> } = $props();

  let tab = $state<'file' | 'npm'>('file');
  let file = $state<File | null>(null);
  let npmName = $state('');
  let npmVersion = $state('latest');
  let preview = $state<ExtensionPackagePreview | null>(null);
  let enable = $state(true);
  let accepted = $state(false);
  let busy = $state(false);
  let dragging = $state(false);
  let input = $state<HTMLInputElement | null>(null);

  export function review(p: ExtensionPackagePreview) {
    preview = p;
    accepted = false;
    open = true;
  }

  $effect(() => {
    if (!open) {
      preview = null;
      file = null;
      accepted = false;
      busy = false;
    }
  });

  function pick(f: File | null | undefined) {
    if (!f) return;
    if (!/\.(zip|tgz|tar\.gz)$/i.test(f.name)) return void toast.error(t('Yalnızca .zip, .tgz ya da .tar.gz dosyaları yüklenebilir.'));
    file = f;
  }

  async function check() {
    busy = true;
    try {
      preview =
        tab === 'file'
          ? await api.upload<ExtensionPackagePreview>('/api/admin/extensions/upload', file!, file!.name)
          : await api.post<ExtensionPackagePreview>('/api/admin/extensions/npm', { name: npmName.trim(), version: npmVersion.trim() || 'latest' });
      accepted = false;
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      busy = false;
    }
  }

  async function install() {
    if (!preview) return;
    busy = true;
    try {
      const ext = await api.post<AdminExtension>('/api/admin/extensions/install', { token: preview.token, enable });
      toast.success(preview.installedVersion ? t('"{name}" v{version} sürümüne güncellendi.', { name: ext.name, version: ext.version }) : t('"{name}" kuruldu.', { name: ext.name }));
      open = false;
      await onInstalled?.(ext);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      busy = false;
    }
  }

  const m = $derived(preview?.manifest);
  const abilities = $derived.by(() => {
    if (!preview || !m) return [];
    const out: Array<{ text: string; danger?: boolean }> = [];
    if (preview.hasServer) out.push({ text: t('Sunucuda kod çalıştırır: veritabanına, dosyalara ve internete tam erişimi olur.'), danger: true });
    if (m.client.scripts.length) out.push({ text: t('Forumun her sayfasında JavaScript çalıştırır.'), danger: true });
    if (m.client.styles.length) out.push({ text: t('Forumun görünümüne CSS ekler.') });
    const csp = Object.values(m.csp).flat();
    if (csp.length) out.push({ text: t('Tarayıcının şu adreslere bağlanmasına izin ister: {list}', { list: csp.join(', ') }) });
    if (m.permissions.length) out.push({ text: t('Yeni yetkiler ekler: {list}', { list: m.permissions.map((p) => p.label).join(', ') }) });
    if (m.nav.length) out.push({ text: t('Üst menüye bağlantı ekler: {list}', { list: m.nav.map((n) => n.label).join(', ') }) });
    if (m.settings.length) out.push({ text: t('{n} ayarı var (kurduktan sonra Yönet ekranından).', { n: m.settings.length }) });
    if (preview.dependencies.length) out.push({ text: t('Bağımlılıkları kurulur: {list}', { list: preview.dependencies.join(', ') }) });
    return out;
  });
  const needsConsent = $derived(!!preview && (preview.hasServer || !!m?.client.scripts.length));
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title>{preview ? (preview.installedVersion ? t('Eklentiyi güncelle') : t('Eklentiyi kur')) : t('Eklenti yükle')}</Dialog.Title>
      <Dialog.Description>
        {preview ? t('Kurmadan önce eklentinin ne yapacağını gözden geçir.') : t('InkForum eklentisi bir .zip / .tgz dosyası ya da npm paketidir.')}
      </Dialog.Description>
    </Dialog.Header>

    {#if !preview}
      <div class="flex rounded-lg bg-muted p-1 text-sm">
        {#each [{ v: 'file', l: t('Dosya yükle'), i: UploadIcon }, { v: 'npm', l: t("npm'den kur"), i: NpmIcon }] as o (o.v)}
          <button type="button" class={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-semibold', tab === o.v ? 'bg-background shadow-sm' : 'text-muted-foreground')} onclick={() => (tab = o.v as typeof tab)}>
            <o.i class="size-4" />{o.l}
          </button>
        {/each}
      </div>

      {#if tab === 'file'}
        <button
          type="button"
          class={cn('grid w-full place-items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors', dragging ? 'border-primary bg-primary-soft' : 'hover:border-ring/50 hover:bg-accent/40')}
          onclick={() => input?.click()}
          ondragover={(e) => (e.preventDefault(), (dragging = true))}
          ondragleave={() => (dragging = false)}
          ondrop={(e) => (e.preventDefault(), (dragging = false), pick(e.dataTransfer?.files[0]))}
        >
          <FileZipIcon class="size-10 text-muted-foreground" weight="duotone" />
          {#if file}
            <span class="font-semibold">{file.name}</span>
            <span class="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
          {:else}
            <span class="font-semibold">{t('Paketi buraya sürükle ya da seç')}</span>
            <span class="text-xs text-muted-foreground">{t('.zip, .tgz — en fazla 50 MB')}</span>
          {/if}
        </button>
        <input bind:this={input} type="file" accept=".zip,.tgz,.gz" class="hidden" onchange={(e) => pick((e.currentTarget as HTMLInputElement).files?.[0])} />
      {:else}
        <div class="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <Field label={t('Paket adı')} hint={t('ör. inkforum-ucp ya da @kullanici/inkforum-basvuru')}><Input bind:value={npmName} placeholder="inkforum-…" autocomplete="off" spellcheck={false} /></Field>
          <Field label={t('Sürüm')}><Input bind:value={npmVersion} placeholder="latest" autocomplete="off" spellcheck={false} /></Field>
        </div>
      {/if}

      <Dialog.Footer>
        <Button variant="ghost" onclick={() => (open = false)}>{t('Vazgeç')}</Button>
        <Button disabled={busy || (tab === 'file' ? !file : !npmName.trim())} onclick={check}>{busy ? t('Denetleniyor…') : t('Devam')}</Button>
      </Dialog.Footer>
    {:else if m}
      <div class="grid gap-4">
        <div class="rounded-xl border bg-muted/30 p-4">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-lg font-bold">{m.name}</span>
            <span class="rounded-md bg-background px-1.5 py-0.5 font-mono text-xs">
              {#if preview.installedVersion}v{preview.installedVersion} → {/if}v{m.version}
            </span>
          </div>
          {#if m.description}<p class="mt-1 text-sm text-muted-foreground">{m.description}</p>{/if}
          <p class="mt-2 text-xs text-muted-foreground">
            {#if m.author}{t('Geliştirici: {name}', { name: m.author })} · {/if}{t('Kimlik: {id}', { id: m.id })} · {t('{n} dosya, {size}', { n: preview.files, size: formatBytes(preview.size) })}
          </p>
        </div>

        {#if !preview.compatible}
          <p class="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"><WarningIcon class="mt-0.5 size-4 shrink-0" />{t('Bu eklenti InkForum {range} gerektiriyor; kurulu sürümle uyumlu değil.', { range: m.inkforum })}</p>
        {/if}

        {#if abilities.length}
          <div>
            <h3 class="mb-2 text-sm font-bold">{t('Bu eklenti:')}</h3>
            <ul class="grid gap-1.5 text-sm">
              {#each abilities as a (a.text)}
                <li class="flex items-start gap-2">
                  {#if a.danger}<ShieldWarningIcon class="mt-0.5 size-4 shrink-0 text-warning" weight="fill" />{:else}<CheckIcon class="mt-0.5 size-4 shrink-0 text-success" />{/if}
                  <span>{a.text}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#each preview.warnings as w (w)}
          <p class="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs"><WarningIcon class="mt-px size-4 shrink-0 text-warning" />{w}</p>
        {/each}

        {#if needsConsent}
          <label class="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">
            <input type="checkbox" bind:checked={accepted} class="mt-1 size-4 accent-[var(--primary)]" />
            <span>{t('Bu eklentinin kaynağına güveniyorum. Eklentiler forumda yönetici yetkisiyle çalışır; güvenmediğin kaynaklardan eklenti kurma.')}</span>
          </label>
        {/if}

        <label class="flex items-center gap-3 text-sm"><Switch bind:checked={enable} />{t('Kurduktan sonra etkinleştir')}</label>
      </div>

      <Dialog.Footer>
        <Button variant="ghost" onclick={() => (preview = null)}><ArrowLeftIcon />{t('Geri')}</Button>
        <Button disabled={busy || !preview.compatible || (needsConsent && !accepted)} onclick={install}>
          {busy ? t('Kuruluyor…') : preview.installedVersion ? t('Güncelle') : t('Kur')}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
