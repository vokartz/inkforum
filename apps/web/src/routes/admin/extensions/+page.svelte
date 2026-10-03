<script lang="ts">
  import { PLUGIN_CATEGORIES, type AdminExtension, type AdminPlugin, type ExtensionPackagePreview, type ExtensionSample, type PluginKey } from '@forum/shared';
  import { invalidate, invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/PuzzlePiece';
  import HouseIcon from 'phosphor-svelte/lib/HouseLine';
  import DiscordIcon from 'phosphor-svelte/lib/DiscordLogo';
  import BookIcon from 'phosphor-svelte/lib/BookOpenText';
  import ClipboardIcon from 'phosphor-svelte/lib/ClipboardText';
  import LifebuoyIcon from 'phosphor-svelte/lib/Lifebuoy';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import GearIcon from 'phosphor-svelte/lib/GearSix';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import CodeIcon from 'phosphor-svelte/lib/Code';
  import FolderIcon from 'phosphor-svelte/lib/FolderOpen';
  import WarningIcon from 'phosphor-svelte/lib/WarningCircle';
  import ShieldWarningIcon from 'phosphor-svelte/lib/ShieldWarning';
  import PackageIcon from 'phosphor-svelte/lib/Package';
  import DownloadIcon from 'phosphor-svelte/lib/DownloadSimple';
  import GiftIcon from 'phosphor-svelte/lib/Gift';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import InstallDialog from '$lib/components/admin/extensions/InstallDialog.svelte';
  import ExtensionStatusBadge from '$lib/components/admin/extensions/ExtensionStatusBadge.svelte';
  import { api, errorMessage } from '$lib/api';
  import { can } from '$lib/viewer';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const ICONS: Record<PluginKey, typeof HouseIcon> = { landing: HouseIcon, wiki: BookIcon, applications: ClipboardIcon, tickets: LifebuoyIcon, discord: DiscordIcon };
  const canInstall = $derived(can(data.viewer, 'admin.extensions'));

  let q = $state('');
  const match = (text: string) => !q.trim() || text.toLocaleLowerCase('tr-TR').includes(q.trim().toLocaleLowerCase('tr-TR'));
  const installed = $derived((data.overview?.items ?? []).filter((e) => match(`${e.name} ${e.description} ${e.author} ${e.id}`)));
  const builtin = $derived((data.builtin ?? []).filter((p) => match(`${t(p.name)} ${t(p.description)}`)));

  let installOpen = $state(false);
  let installer = $state<ReturnType<typeof InstallDialog> | null>(null);
  const samples = $derived((data.samples ?? []).filter((x) => match(`${x.name} ${x.description}`)));

  async function installSample(s: ExtensionSample) {
    busy = `sample:${s.id}`;
    try {
      installer?.review(await api.post<ExtensionPackagePreview>(`/api/admin/extensions/samples/${s.id}/stage`));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      busy = null;
    }
  }
  let busy = $state<string | null>(null);

  async function refresh() {
    await invalidate('app:admin-extensions');
    await invalidateAll();
  }

  async function toggleBuiltin(p: AdminPlugin, enabled: boolean) {
    busy = p.key;
    try {
      await api.put(`/api/admin/plugins/${p.key}`, { enabled });
      toast.success(enabled ? t('"{name}" etkinleştirildi.', { name: t(p.name) }) : t('"{name}" kapatıldı; veriler korunur.', { name: t(p.name) }));
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      busy = null;
    }
  }

  async function toggle(e: AdminExtension, enabled: boolean) {
    busy = e.id;
    try {
      await api.put(`/api/admin/extensions/${e.id}/enabled`, { enabled });
      toast.success(enabled ? t('"{name}" etkinleştirildi.', { name: e.name }) : t('"{name}" kapatıldı; verileri korunur.', { name: e.name }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      busy = null;
      await refresh();
    }
  }

  async function scan() {
    try {
      const res = await api.post<{ found: string[] }>('/api/admin/extensions/scan');
      toast.success(res.found.length ? t('{n} yeni eklenti bulundu.', { n: res.found.length }) : t('Klasörde yeni eklenti yok.'));
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  function caps(e: AdminExtension): string[] {
    const c = e.capabilities;
    const out: string[] = [];
    if (c.pages.length) out.push(t('{n} sayfa', { n: c.pages.length }));
    if (c.adminPages.length) out.push(t('{n} yönetim sayfası', { n: c.adminPages.length }));
    if (c.routes) out.push(t('{n} API ucu', { n: c.routes }));
    if (c.slots.length) out.push(t('{n} yer', { n: c.slots.length }));
    if (c.permissions.length) out.push(t('{n} yetki', { n: c.permissions.length }));
    if (c.settings) out.push(t('{n} ayar', { n: c.settings }));
    if (c.clientScripts) out.push(t('Her sayfada betik'));
    return out;
  }
</script>

<PageHeader
  icon={PageHeaderIcon}
  title={t('Eklentiler')}
  description={t('Foruma yeni sayfalar, yönetim ekranları, oyun sunucusu paneli (UCP), başvuru sistemleri ve daha fazlasını ekle. Eklentiler .zip / .tgz dosyası ya da npm paketi olarak kurulur.')}
>
  {#snippet actions()}
    <Button variant="outline" href="/admin/extensions/docs"><CodeIcon />{t('Eklenti geliştir')}</Button>
    {#if canInstall}<Button onclick={() => (installOpen = true)}><UploadIcon />{t('Eklenti yükle')}</Button>{/if}
  {/snippet}
</PageHeader>

{#if data.overview}
  {#if data.overview.safeMode}
    <div class="mb-5 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
      <ShieldWarningIcon class="mt-0.5 size-5 shrink-0 text-warning" weight="fill" />
      <p>{t('Eklenti güvenli modu açık: kurulu eklentilerin hiçbiri yüklenmiyor. Kapatmak için INKFORUM_SAFE_MODE ayarını kaldırın ya da storage/extensions/.safemode dosyasını silip forumu yeniden başlatın.')}</p>
    </div>
  {/if}

  <div class="mb-6 flex flex-wrap items-center gap-2">
    <div class="relative w-full max-w-xs">
      <MagnifyingGlassIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input bind:value={q} placeholder={t('Eklenti ara…')} class="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm outline-none focus:border-ring" />
    </div>
    {#if canInstall}
      <Button variant="ghost" size="sm" class="ml-auto text-muted-foreground" onclick={scan} title={t('storage/extensions klasörüne FTP ile kopyalanan eklentileri bulur')}><FolderIcon />{t('Klasörü tara')}</Button>
    {/if}
  </div>

  <!-- Kurulu eklentiler -->
  <section class="mb-10" data-part="extension-list">
    <h2 class="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">
      <PackageIcon class="size-4" />{t('Yüklenen eklentiler')}<span class="rounded-full bg-muted px-2 text-xs">{data.overview.items.length}</span>
    </h2>
    {#if !data.overview.items.length}
      <div class="grid place-items-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center">
        <span class="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><PageHeaderIcon class="size-7" weight="duotone" /></span>
        <h3 class="text-lg font-bold">{t('Henüz eklenti yüklemedin')}</h3>
        <p class="max-w-lg text-sm text-muted-foreground">{t('Bir eklenti paketi (.zip / .tgz) yükle ya da npm paket adını yazarak kur. Kendi eklentini yazmak için geliştirici rehberine göz at.')}</p>
        <div class="mt-2 flex flex-wrap justify-center gap-2">
          {#if canInstall}<Button onclick={() => (installOpen = true)}><UploadIcon />{t('Eklenti yükle')}</Button>{/if}
          <Button variant="outline" href="/admin/extensions/docs"><CodeIcon />{t('Geliştirici rehberi')}</Button>
        </div>
      </div>
    {:else}
      <div class="grid gap-4 lg:grid-cols-2">
        {#each installed as e (e.id)}
          <article class={cn('flex flex-col overflow-hidden rounded-2xl border bg-card', e.status === 'active' ? 'border-primary/30 shadow-card' : e.status === 'error' ? 'border-destructive/40' : '')}>
            <div class="flex items-start gap-4 p-5">
              <span class={cn('flex size-12 shrink-0 items-center justify-center rounded-xl border', e.status === 'active' ? 'border-primary/25 bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                <NodeIcon nodes={e.iconNode} size={26} />
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg font-bold">{e.name}</h3>
                  <span class="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">v{e.version}</span>
                  <ExtensionStatusBadge status={e.status} />
                </div>
                <p class="mt-1 text-sm text-muted-foreground">{e.description || t('Açıklama yok.')}</p>
                <p class="mt-1 text-xs text-muted-foreground">
                  {#if e.author}{t('Geliştirici: {name}', { name: e.author })} · {/if}{e.source === 'npm' ? `npm: ${e.packageName}` : e.source === 'local' ? t('Klasörden') : t('Yüklenen paket')}
                </p>
              </div>
              {#if canInstall}
                <Switch checked={e.enabled && e.status !== 'error'} disabled={busy === e.id || e.status === 'incompatible'} onCheckedChange={(v) => toggle(e, v)} aria-label={e.enabled ? t('{name} eklentisini kapat', { name: e.name }) : t('{name} eklentisini aç', { name: e.name })} />
              {/if}
            </div>
            {#if e.error}
              <p class="mx-5 mb-3 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"><WarningIcon class="mt-px size-4 shrink-0" />{e.error}</p>
            {/if}
            <div class="mt-auto flex flex-wrap items-center gap-2 border-t bg-muted/30 px-5 py-3">
              {#each caps(e) as c (c)}<span class="rounded-full bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border">{c}</span>{/each}
              <span class="ml-auto flex gap-1.5">
                {#if e.status === 'active' && e.publicHref}<Button variant="ghost" size="sm" href={e.publicHref} target="_blank"><ArrowSquareOutIcon />{t('Aç')}</Button>{/if}
                <Button variant="outline" size="sm" href={e.adminHref ?? `/admin/extensions/${e.id}`}><GearIcon />{t('Yönet')}</Button>
              </span>
            </div>
          </article>
        {:else}
          <p class="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t('Aramaya uyan eklenti yok.')}</p>
        {/each}
      </div>
    {/if}
  </section>

  {#if samples.length}
    <section class="mb-10" data-part="extension-samples">
      <h2 class="mb-1 flex items-center gap-2 text-sm font-bold tracking-wide text-muted-foreground uppercase"><GiftIcon class="size-4" />{t('Hazır eklentiler')}</h2>
      <p class="mb-3 text-sm text-muted-foreground">{t('InkForum ile gelen örnek eklentiler. Tek tıkla kurabilir ya da indirip kendi eklentine temel yapabilirsin.')}</p>
      <div class="grid gap-4 lg:grid-cols-2">
        {#each samples as s (s.id)}
          <article class="flex flex-col overflow-hidden rounded-2xl border bg-card">
            <div class="flex items-start gap-4 p-5">
              <span class="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-muted text-muted-foreground"><NodeIcon nodes={s.iconNode} size={26} /></span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg font-bold">{s.name}</h3>
                  <span class="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">v{s.version}</span>
                  {#if s.installedVersion}<span class="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-bold text-success">{t('Kurulu')}</span>{/if}
                </div>
                <p class="mt-1 text-sm text-muted-foreground">{s.description}</p>
              </div>
            </div>
            <div class="mt-auto flex flex-wrap items-center justify-end gap-2 border-t bg-muted/30 px-5 py-3">
              <Button variant="ghost" size="sm" href="/api/admin/extensions/samples/{s.id}/download" download><DownloadIcon />{t('İndir (.zip)')}</Button>
              {#if s.installedVersion}
                <Button variant="outline" size="sm" href="/admin/extensions/{s.id}">{t('Yönet')}</Button>
              {:else if canInstall}
                <Button size="sm" disabled={busy === `sample:${s.id}`} onclick={() => installSample(s)}><PageHeaderIcon />{t('Kur')}</Button>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  <section data-part="plugin-list">
    <h2 class="mb-1 flex items-center gap-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">{t('Yerleşik eklentiler')}</h2>
    <p class="mb-3 text-sm text-muted-foreground">{t('InkForum ile gelen özellikler. Kapatılan eklentinin sayfaları ve menü öğeleri gizlenir; verileri silinmez.')}</p>
    <div class="grid gap-4 lg:grid-cols-2">
      {#each builtin as p (p.key)}
        {@const Icon = ICONS[p.key]}
        <article class={cn('flex flex-col overflow-hidden rounded-2xl border bg-card', p.enabled ? 'border-primary/30 shadow-card' : 'opacity-90')}>
          <div class="flex items-start gap-4 p-5">
            <span class={cn('flex size-12 shrink-0 items-center justify-center rounded-xl border', p.enabled ? 'border-primary/25 bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}><Icon class="size-6" /></span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-lg font-bold">{t(p.name)}</h3>
                <span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{t(PLUGIN_CATEGORIES[p.category])}</span>
              </div>
              <p class="mt-1 text-sm text-muted-foreground">{t(p.description)}</p>
            </div>
            <Switch checked={p.enabled} disabled={busy === p.key} onCheckedChange={(v) => toggleBuiltin(p, v)} aria-label={p.enabled ? t('{name} eklentisini kapat', { name: t(p.name) }) : t('{name} eklentisini aç', { name: t(p.name) })} />
          </div>
          <ul class="grid gap-1.5 px-5 pb-4 text-sm">
            {#each p.features as f (f)}<li class="flex items-center gap-2"><CheckIcon class="size-4 shrink-0 text-success" weight="bold" />{t(f)}</li>{/each}
          </ul>
          <div class="mt-auto flex flex-wrap items-center gap-2 border-t bg-muted/30 px-5 py-3">
            {#each p.stats as s (s)}<span class="rounded-full bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border">{s}</span>{/each}
            <span class="ml-auto flex gap-1.5">
              {#if p.enabled && p.publicHref}<Button variant="ghost" size="sm" href={p.publicHref} target="_blank"><ArrowSquareOutIcon />{t('Aç')}</Button>{/if}
              {#if p.enabled && p.adminHref}<Button variant="outline" size="sm" href={p.adminHref}><GearIcon />{t('Yönet')}</Button>{/if}
            </span>
          </div>
        </article>
      {/each}
    </div>
  </section>
{/if}

{#if canInstall}
  <InstallDialog bind:this={installer} bind:open={installOpen} onInstalled={refresh} />
{/if}
