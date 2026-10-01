<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { slide } from 'svelte/transition';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/ArrowSquareIn';
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import WarningIcon from 'phosphor-svelte/lib/WarningCircle';
  import XCircleIcon from 'phosphor-svelte/lib/XCircle';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import PlayIcon from 'phosphor-svelte/lib/Play';
  import StopIcon from 'phosphor-svelte/lib/Stop';
  import KeyIcon from 'phosphor-svelte/lib/Key';
  import LinkIcon from 'phosphor-svelte/lib/LinkSimple';
  import ImagesIcon from 'phosphor-svelte/lib/Images';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheck';
  import TerminalIcon from 'phosphor-svelte/lib/TerminalWindow';
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight';
  import WrenchIcon from 'phosphor-svelte/lib/Wrench';
  import ClockIcon from 'phosphor-svelte/lib/Clock';
  import * as Card from '$lib/components/ui/card';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import { Input } from '$lib/components/ui/input';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { fileSize, formatDateTime, formatNumber } from '$lib/format';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';
  import type { Charset, ImportRun } from './+page';

  let { data } = $props();
  const runs = $derived(data.imports?.runs ?? []);
  /** Üzerinde çalışılan kayıt: süren, hazır ya da en son biten */
  let selectedId = $state<number | null>(null);
  const current = $derived(
    runs.find((r) => r.id === selectedId) ?? runs.find((r) => r.status === 'staging' || r.status === 'running' || r.status === 'ready') ?? null,
  );
  const busy = $derived(current?.status === 'staging' || current?.status === 'running');

  // Süren iş varken durum düzenli yenilenir
  $effect(() => {
    if (!busy) return;
    const timer = setInterval(() => invalidate('app:admin-import'), 1200);
    return () => clearInterval(timer);
  });

  const PLATFORMS = [
    { key: 'smf', name: 'SMF', versions: '2.0 · 2.1' },
    { key: 'phpbb', name: 'phpBB', versions: '3.0 – 3.3' },
    { key: 'ips', name: 'Invision Community', versions: '4.x · 5.x' },
    { key: 'mybb', name: 'MyBB', versions: '1.8' },
  ];

  const PHASES: Array<{ key: string; label: string }> = [
    { key: 'backup', label: 'Yedek alınıyor' },
    { key: 'clear', label: 'Mevcut forum temizleniyor' },
    { key: 'groups', label: 'Gruplar ve rütbeler' },
    { key: 'users', label: 'Üyeler' },
    { key: 'boards', label: 'Kategoriler, bölümler ve erişim' },
    { key: 'topics', label: 'Konular' },
    { key: 'posts', label: 'Mesajlar ve ekler' },
    { key: 'polls', label: 'Anketler' },
    { key: 'conversations', label: 'Özel mesajlar' },
    { key: 'bans', label: 'Yasaklar' },
    { key: 'recount', label: 'Sayaçlar ve rütbeler' },
    { key: 'avatars', label: 'Avatarlar' },
  ];
  const phaseIndex = (key: string | undefined) => PHASES.findIndex((p) => p.key === key);

  const COUNT_LABELS: Array<{ key: keyof NonNullable<ImportRun['analysis']['counts']>; label: string }> = [
    { key: 'users', label: 'Üye' },
    { key: 'groups', label: 'Grup ve rütbe' },
    { key: 'categories', label: 'Kategori' },
    { key: 'boards', label: 'Bölüm' },
    { key: 'topics', label: 'Konu' },
    { key: 'posts', label: 'Mesaj' },
    { key: 'polls', label: 'Anket' },
    { key: 'conversations', label: 'Özel mesaj' },
    { key: 'attachments', label: 'Ek dosya' },
  ];

  const STAT_LABELS: Record<string, string> = {
    users: 'Üye',
    usersMerged: 'Eşleşen hesap',
    groups: 'Grup ve rütbe',
    groupIcons: 'Rütbe görseli',
    categories: 'Kategori',
    boards: 'Bölüm',
    moderators: 'Bölüm moderatörü',
    profiles: 'Erişim profili',
    topics: 'Konu',
    posts: 'Mesaj',
    images: 'İndirilen görsel',
    polls: 'Anket',
    conversations: 'Özel mesaj',
    bans: 'Yasak',
    avatars: 'Avatar',
  };

  // ----- 1) Yükleme -----
  let uploadPct = $state<number | null>(null);
  let dragging = $state(false);
  function upload(file: File) {
    if (!/\.sql(\.gz)?$/i.test(file.name)) {
      toast.error(t('Veritabanı dökümü seçin (.sql veya .sql.gz).'));
      return;
    }
    const form = new FormData();
    form.append('file', file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/import/upload');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && (uploadPct = Math.round((e.loaded / e.total) * 100));
    xhr.onload = async () => {
      uploadPct = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        selectedId = (JSON.parse(xhr.responseText) as { id: number }).id;
        await invalidate('app:admin-import');
      } else {
        try {
          toast.error(JSON.parse(xhr.responseText).error.message);
        } catch {
          toast.error(t('Yükleme başarısız.'));
        }
      }
    };
    xhr.onerror = () => {
      uploadPct = null;
      toast.error(t('Bağlantı hatası.'));
    };
    uploadPct = 0;
    xhr.send(form);
  }
  function onPick(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) upload(f);
    (e.currentTarget as HTMLInputElement).value = '';
  }

  // ----- 2) Seçenekler -----
  let charset = $state<Charset>('utf8');
  let fixMojibake = $state(false);
  let baseUrl = $state('');
  let clearForum = $state(true);
  let replaceRanks = $state(true);
  let include = $state({ polls: true, conversations: true, bans: true });
  let files = $state({ avatars: true, groupIcons: true, attachmentImages: true });
  let configuredFor = 0;

  // Analiz gelince önerilen değerler doldurulur (kayıt başına bir kez)
  $effect(() => {
    const r = current;
    if (!r || r.status !== 'ready' || configuredFor === r.id) return;
    untrack(() => {
      configuredFor = r.id;
      charset = r.analysis.charset ?? 'utf8';
      fixMojibake = !!r.analysis.mojibake;
      baseUrl = r.analysis.baseUrl ?? '';
    });
  });

  let samples = $state<string[]>([]);
  let loadingSamples = $state(false);
  $effect(() => {
    const r = current;
    if (!r || r.status !== 'ready') return;
    const cs = charset;
    const fix = fixMojibake;
    loadingSamples = true;
    api
      .get<{ samples: string[] }>(`/api/admin/import/${r.id}/preview?charset=${cs}&fix=${fix ? 1 : 0}`)
      .then((res) => (samples = res.samples))
      .catch(() => (samples = []))
      .finally(() => (loadingSamples = false));
  });

  const baseUrlValid = $derived(baseUrl.trim() === '' || /^https?:\/\/[^\s/]+/i.test(baseUrl.trim()));
  const wantsFiles = $derived(files.avatars || files.groupIcons || files.attachmentImages);

  let confirmOpen = $state(false);
  let starting = $state(false);
  async function start() {
    if (!current) return;
    starting = true;
    try {
      await api.post(`/api/admin/import/${current.id}/start`, {
        charset,
        fixMojibake,
        baseUrl: baseUrl.trim(),
        clearForum,
        replaceRanks,
        include,
        files,
        confirm: true,
      });
      confirmOpen = false;
      await invalidate('app:admin-import');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      starting = false;
    }
  }

  async function cancel() {
    if (!current) return;
    if (!(await confirmAction({ title: t('Aktarma durdurulsun mu?'), description: t('Şu ana kadar aktarılanlar kalır. Temiz bir başlangıç için aktarma öncesi yedeği geri yükleyebilirsin.'), confirmLabel: t('Durdur'), destructive: true }))) return;
    await api.post(`/api/admin/import/${current.id}/cancel`).catch((e) => toast.error(errorMessage(e)));
  }

  async function remove(r: ImportRun) {
    if (!(await confirmAction({ title: t('Kayıt silinsin mi?'), description: t('Ara depo dosyaları silinir; aktarılan içerik forumda kalır.'), confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/admin/import/${r.id}`);
      if (selectedId === r.id) selectedId = null;
      await invalidate('app:admin-import');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  function newImport() {
    selectedId = -1;
  }

  let logBox = $state<HTMLElement | null>(null);
  $effect(() => {
    void current?.log.length;
    if (logBox) logBox.scrollTop = logBox.scrollHeight;
  });

  const pct = (p: { done: number; total: number } | null) => (p && p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : null);
  const showUpload = $derived(!current || selectedId === -1 || current.status === 'failed' || current.status === 'cancelled' || current.status === 'done');
</script>

<PageHeader
  icon={PageHeaderIcon}
  title={t('Forum taşıma')}
  description={t('SMF, phpBB, Invision Community veya MyBB forumunu üyeleri, konuları, yetkileri ve rütbe görselleriyle birlikte InkForum’a taşı.')}
>
  {#snippet actions()}
    <Button variant="outline" href="/admin/maintenance"><WrenchIcon />{t('Bakım ve yedekler')}</Button>
  {/snippet}
</PageHeader>

{#if data.imports}
  {#if current && selectedId !== -1}
    <!-- ===== Süren / hazır / biten aktarma ===== -->
    <Card.Root class="mb-6">
      <Card.Header class="flex flex-row flex-wrap items-start justify-between gap-3">
        <div class="grid gap-1">
          <Card.Title class="flex flex-wrap items-center gap-2 text-base">
            {current.platformName || t('Döküm')}
            {#if current.version}<span class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{current.version}</span>{/if}
            <span
              class={cn(
                'rounded-full px-2 py-0.5 text-xs font-semibold',
                current.status === 'done' && 'bg-success/15 text-success',
                (current.status === 'failed' || current.status === 'cancelled') && 'bg-destructive/15 text-destructive',
                (current.status === 'staging' || current.status === 'running') && 'bg-primary-soft text-primary',
                current.status === 'ready' && 'bg-warning/15 text-warning',
              )}
            >
              {current.status === 'staging'
                ? t('Döküm okunuyor')
                : current.status === 'ready'
                  ? t('Aktarmaya hazır')
                  : current.status === 'running'
                    ? t('Aktarılıyor')
                    : current.status === 'done'
                      ? t('Tamamlandı')
                      : current.status === 'cancelled'
                        ? t('Durduruldu')
                        : t('Başarısız')}
            </span>
          </Card.Title>
          <Card.Description>{current.sourceName} · {fileSize(current.sourceSize)} · {formatDateTime(current.createdAt)}</Card.Description>
        </div>
        <div class="flex gap-2">
          {#if current.status === 'running'}<Button variant="outline" size="sm" onclick={cancel}><StopIcon />{t('Durdur')}</Button>{/if}
          {#if !busy}<Button variant="outline" size="sm" onclick={newImport}><UploadIcon />{t('Yeni döküm')}</Button>{/if}
        </div>
      </Card.Header>
      <Card.Content class="grid gap-6">
        {#if current.status === 'staging'}
          <div class="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm">
            <LoaderIcon class="size-5 animate-spin text-primary" />
            <div class="grid">
              <b>{t('Döküm dosyası okunuyor ve çözümleniyor…')}</b>
              <span class="text-muted-foreground tabular-nums">{t('{n} satır okundu', { n: formatNumber(current.progress?.done ?? 0) })}</span>
            </div>
          </div>
        {/if}

        {#if current.error}
          <div class="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
            <XCircleIcon class="mt-0.5 size-5 shrink-0 text-destructive" weight="fill" />
            <span>{current.error}</span>
          </div>
        {/if}

        {#if current.analysis.counts}
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9" data-part="counts">
            {#each COUNT_LABELS as c (c.key)}
              <div class="rounded-xl border bg-card px-3 py-2">
                <p class="text-lg font-bold tabular-nums">{formatNumber(current.analysis.counts[c.key] ?? 0)}</p>
                <p class="truncate text-xs text-muted-foreground">{t(c.label)}</p>
              </div>
            {/each}
          </div>
        {/if}

        {#if current.status === 'ready'}
          <!-- ===== Seçenekler ===== -->
          <div class="grid gap-6 lg:grid-cols-2">
            <section class="grid content-start gap-4">
              <h3 class="text-sm font-bold">{t('Metin ve karakter seti')}</h3>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="grid gap-1.5 text-sm">
                  <span class="font-medium">{t('Karakter seti')}</span>
                  <select bind:value={charset} class="h-9 rounded-md border bg-background px-2 text-sm">
                    <option value="utf8">UTF-8</option>
                    <option value="windows-1254">{t('Türkçe (ISO-8859-9 / Windows-1254)')}</option>
                    <option value="windows-1252">{t('Batı Avrupa (Latin-1 / Windows-1252)')}</option>
                  </select>
                </label>
                <label class="flex items-center justify-between gap-3 self-end rounded-xl border px-3 py-2 text-sm">
                  <span class="grid">
                    <span class="font-medium">{t('Bozuk karakterleri onar')}</span>
                    <span class="text-xs text-muted-foreground">ÅŸ → ş · Ä± → ı</span>
                  </span>
                  <Switch bind:checked={fixMojibake} />
                </label>
              </div>
              <div class="rounded-xl border bg-muted/40 p-3">
                <p class="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  {t('Önizleme')}
                  {#if loadingSamples}<LoaderIcon class="size-3 animate-spin" />{/if}
                </p>
                <div class="flex flex-wrap gap-1.5">
                  {#each samples as s, i (i)}<span class="max-w-full truncate rounded-md bg-background px-2 py-0.5 text-sm">{s}</span>{/each}
                </div>
                <p class="mt-2 text-xs text-muted-foreground">{t('Türkçe karakterler (ş, ğ, ı, İ) doğru görünene kadar ayarları değiştir.')}</p>
              </div>

              <h3 class="mt-2 text-sm font-bold">{t('Eski forumun adresi')}</h3>
              <label class="grid gap-1.5 text-sm">
                <Input bind:value={baseUrl} placeholder="https://eskiforum.com" aria-invalid={!baseUrlValid} />
                <span class={cn('text-xs', baseUrlValid ? 'text-muted-foreground' : 'text-destructive')}>
                  {baseUrlValid
                    ? t('Avatarlar, rütbe görselleri ve ek dosyalar bu adresten indirilir. Eski site kapalıysa boş bırak; görseller eski adreslerine bağlı kalır.')
                    : t('Adres http:// veya https:// ile başlamalı.')}
                </span>
              </label>
            </section>

            <section class="grid content-start gap-4">
              <h3 class="text-sm font-bold">{t('Neler aktarılsın?')}</h3>
              <div class="grid gap-2">
                <label class="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm">
                  <span class="grid"><span class="font-medium">{t('Mevcut forumu temizle')}</span><span class="text-xs text-muted-foreground">{t('Kurulumdaki örnek kategori, bölüm ve konular silinir.')}</span></span>
                  <Switch bind:checked={clearForum} />
                </label>
                <label class="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm">
                  <span class="grid"><span class="font-medium">{t('Rütbeleri eski forumdan al')}</span><span class="text-xs text-muted-foreground">{t('Varsayılan mesaj rütbeleri kaldırılır, eski forumun rütbeleri kullanılır.')}</span></span>
                  <Switch bind:checked={replaceRanks} />
                </label>
                <label class="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm"><span class="font-medium">{t('Anketler')}</span><Switch bind:checked={include.polls} /></label>
                <label class="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm"><span class="font-medium">{t('Özel mesajlar')}</span><Switch bind:checked={include.conversations} /></label>
                <label class="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm"><span class="font-medium">{t('Yasaklar (üye, IP, e-posta)')}</span><Switch bind:checked={include.bans} /></label>
              </div>
              <h3 class="mt-2 flex items-center gap-2 text-sm font-bold"><ImagesIcon class="size-4" />{t('Dosyalar')}</h3>
              <div class="grid gap-2">
                <label class="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"><span class="font-medium">{t('Avatarlar')}</span><Switch bind:checked={files.avatars} disabled={!baseUrl.trim()} /></label>
                <label class="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"><span class="font-medium">{t('Rütbe görselleri')}</span><Switch bind:checked={files.groupIcons} disabled={!baseUrl.trim()} /></label>
                <label class="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"><span class="font-medium">{t('Ek görseller')}</span><Switch bind:checked={files.attachmentImages} disabled={!baseUrl.trim()} /></label>
              </div>
            </section>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p class="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheckIcon class="size-4 text-success" />{t('Başlamadan önce otomatik yedek alınır.')}</p>
            <Button onclick={() => (confirmOpen = true)} disabled={!baseUrlValid}><PlayIcon weight="fill" />{t('Aktarmayı başlat')}</Button>
          </div>
        {/if}

        {#if current.status === 'running' || current.status === 'done' || ((current.status === 'failed' || current.status === 'cancelled') && current.startedAt)}
          <!-- ===== İlerleme ===== -->
          <div class="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <ol class="grid content-start gap-1" data-part="phases">
              {#each PHASES as p, i (p.key)}
                {@const active = current.status === 'running' && current.progress?.phase === p.key}
                {@const passed = current.status === 'done' || (current.progress && phaseIndex(current.progress.phase) > i)}
                <li class={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm', active && 'bg-primary-soft font-semibold text-primary')}>
                  {#if active}<LoaderIcon class="size-4 shrink-0 animate-spin" />{:else if passed}<CheckIcon class="size-4 shrink-0 text-success" />{:else}<span class="size-4 shrink-0 rounded-full border"></span>{/if}
                  <span class="flex-1 truncate">{t(p.label)}</span>
                  {#if active && pct(current.progress) !== null}<span class="text-xs tabular-nums">%{pct(current.progress)}</span>{/if}
                </li>
              {/each}
            </ol>
            <div class="grid min-w-0 content-start gap-3">
              {#if current.status === 'running' && current.progress}
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div class="h-full rounded-full bg-primary transition-[width] duration-500" style="width:{((phaseIndex(current.progress.phase) + (pct(current.progress) ?? 0) / 100) / PHASES.length) * 100}%"></div>
                </div>
              {/if}
              <div class="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><TerminalIcon class="size-4" />{t('Günlük')}</div>
              <div bind:this={logBox} class="max-h-80 overflow-y-auto rounded-xl border bg-muted/40 p-3 font-mono text-xs leading-relaxed" data-part="log">
                {#each current.log as line, i (i)}
                  <p class={cn(line.level === 'warn' && 'text-warning', line.level === 'error' && 'text-destructive')}>
                    <span class="text-muted-foreground">{new Date(line.t).toLocaleTimeString()}</span>
                    {line.msg}
                  </p>
                {:else}
                  <p class="text-muted-foreground">…</p>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        {#if current.status === 'done'}
          <!-- ===== Özet ===== -->
          <div class="grid gap-4" transition:slide={{ duration: 150 }}>
            <div class="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm">
              <CheckCircleIcon class="mt-0.5 size-5 shrink-0 text-success" weight="fill" />
              <div class="grid gap-1">
                <b>{t('Forumun taşındı!')}</b>
                <span class="text-muted-foreground">{t('Bölüm yetkilerini, grupları ve görünümü kontrol etmeni öneririz. Topluluğuna yeni adresi duyurmayı unutma.')}</span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {#each Object.entries(current.stats).filter(([k]) => STAT_LABELS[k]) as [k, v] (k)}
                <div class="rounded-xl border px-3 py-2">
                  <p class="text-lg font-bold tabular-nums">{formatNumber(v)}</p>
                  <p class="truncate text-xs text-muted-foreground">{t(STAT_LABELS[k]!)}</p>
                </div>
              {/each}
            </div>
            <div class="flex flex-wrap gap-2">
              <Button href="/"><ArrowRightIcon />{t('Foruma git')}</Button>
              <Button variant="outline" href="/admin/forum">{t('Kategoriler ve bölümler')}</Button>
              <Button variant="outline" href="/admin/groups">{t('Gruplar')}</Button>
              <Button variant="outline" href="/admin/permissions">{t('Yetkiler')}</Button>
            </div>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}

  {#if showUpload && !busy}
    <!-- ===== Yeni döküm ===== -->
    <div class="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">{t('Veritabanı dökümünü yükle')}</Card.Title>
          <Card.Description>{t('Eski forumun MySQL / MariaDB dökümü (.sql veya .sql.gz). Platform, sürüm ve tablo öneki otomatik bulunur.')}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-4">
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {#each PLATFORMS as p (p.key)}
              <div class="rounded-xl border px-3 py-2.5">
                <p class="text-sm font-bold">{p.name}</p>
                <p class="text-xs text-muted-foreground">{p.versions}</p>
              </div>
            {/each}
          </div>
          <label
            class={cn('flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors', dragging ? 'border-primary bg-primary-soft/40' : 'hover:border-primary/40')}
            ondragover={(e) => {
              e.preventDefault();
              dragging = true;
            }}
            ondragleave={() => (dragging = false)}
            ondrop={(e) => {
              e.preventDefault();
              dragging = false;
              const f = e.dataTransfer?.files?.[0];
              if (f) upload(f);
            }}
          >
            <input type="file" accept=".sql,.gz" class="sr-only" onchange={onPick} disabled={uploadPct !== null} />
            <UploadIcon class="size-7 text-muted-foreground" />
            <span class="text-sm font-semibold">{t('Dökümü buraya sürükle ya da seç')}</span>
            <span class="text-xs text-muted-foreground">{t('Büyük dökümler için .sql.gz önerilir. Dosya yalnızca sunucunda işlenir.')}</span>
            {#if uploadPct !== null}
              <div class="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted" transition:slide={{ duration: 150 }}>
                <div class="h-full rounded-full bg-primary transition-[width]" style="width:{uploadPct}%"></div>
              </div>
              <span class="text-xs tabular-nums">%{uploadPct}</span>
            {/if}
          </label>
        </Card.Content>
      </Card.Root>

      <div class="grid content-start gap-4">
        <Card.Root>
          <Card.Header><Card.Title class="text-base">{t('Döküm nasıl alınır?')}</Card.Title></Card.Header>
          <Card.Content class="grid gap-3 text-sm">
            <p><b>phpMyAdmin:</b> {t('forum veritabanını seç → Dışa Aktar → Özel → Biçim: SQL, Sıkıştırma: gzip → Git.')}</p>
            <p><b>{t('Komut satırı')}:</b></p>
            <pre class="overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs">mysqldump --default-character-set=utf8mb4 \
  -u KULLANICI -p VERITABANI | gzip &gt; forum.sql.gz</pre>
            <p class="text-muted-foreground">{t('SMF, phpBB ve MyBB’de kendi yedekleme aracının ürettiği SQL dosyası da kullanılabilir.')}</p>
          </Card.Content>
        </Card.Root>
        <Card.Root>
          <Card.Content class="grid gap-3 pt-6 text-sm">
            <p class="flex gap-2"><KeyIcon class="mt-0.5 size-4 shrink-0 text-primary" />{t('Üyeler eski şifreleriyle giriş yapar; ilk girişte şifreleri InkForum’un güvenli biçimine (argon2id) çevrilir.')}</p>
            <p class="flex gap-2"><LinkIcon class="mt-0.5 size-4 shrink-0 text-primary" />{t('Eski konu, bölüm ve profil bağlantıları (viewtopic.php, index.php?topic=…) yeni sayfalara yönlenir; arama motoru sıralaman korunur.')}</p>
            <p class="flex gap-2"><ShieldCheckIcon class="mt-0.5 size-4 shrink-0 text-primary" />{t('Grup renkleri, rütbe görselleri, bölüm erişimleri ve moderatörler de aktarılır.')}</p>
          </Card.Content>
        </Card.Root>
      </div>
    </div>
  {/if}

  {#if runs.length}
    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Geçmiş')}</Card.Title></Card.Header>
      <Card.Content class="p-0">
        <ul class="divide-y border-t">
          {#each runs as r (r.id)}
            <li class={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3', current?.id === r.id && selectedId !== -1 && 'bg-muted/40')}>
              <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                {#if r.status === 'done'}<CheckCircleIcon class="size-5 text-success" weight="fill" />{:else if r.status === 'failed' || r.status === 'cancelled'}<WarningIcon class="size-5 text-destructive" weight="fill" />{:else if r.status === 'ready'}<ClockIcon class="size-5 text-warning" weight="fill" />{:else}<LoaderIcon class="size-5 animate-spin text-primary" />{/if}
              </span>
              <button type="button" class="grid min-w-0 flex-1 basis-48 text-left" onclick={() => (selectedId = r.id)}>
                <span class="truncate text-sm font-semibold">{r.platformName || r.sourceName}{r.version ? ` ${r.version}` : ''}</span>
                <span class="truncate text-xs text-muted-foreground">{r.sourceName} · {formatDateTime(r.createdAt)}</span>
              </button>
              <Button variant="ghost" size="icon-sm" class="text-destructive" disabled={r.status === 'staging' || r.status === 'running'} onclick={() => remove(r)} aria-label={t('Sil')}><TrashIcon /></Button>
            </li>
          {/each}
        </ul>
      </Card.Content>
    </Card.Root>
  {/if}
{/if}

<!-- Başlatma onayı -->
<Dialog.Root bind:open={confirmOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{t('Aktarma başlatılsın mı?')}</Dialog.Title>
      <Dialog.Description>{current?.platformName} {current?.version}</Dialog.Description>
    </Dialog.Header>
    <ul class="grid gap-2 text-sm">
      <li class="flex gap-2"><CheckIcon class="mt-0.5 size-4 shrink-0 text-success" />{t('Önce şu anki verilerin yedeği otomatik alınır; Bakım sayfasından geri dönebilirsin.')}</li>
      {#if clearForum}<li class="flex gap-2"><WarningIcon class="mt-0.5 size-4 shrink-0 text-warning" />{t('Mevcut kategori, bölüm ve konular silinecek.')}</li>{/if}
      <li class="flex gap-2"><CheckIcon class="mt-0.5 size-4 shrink-0 text-success" />{t('Aynı e-posta adresli üyeler mevcut hesaplarla eşleştirilir (yönetici hesabın dahil).')}</li>
      {#if wantsFiles && baseUrl.trim()}<li class="flex gap-2"><ImagesIcon class="mt-0.5 size-4 shrink-0" />{t('Görseller eski siteden indirilecek; büyük forumlarda bu adım uzun sürebilir.')}</li>{/if}
    </ul>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (confirmOpen = false)}>{t('Vazgeç')}</Button>
      <Button onclick={start} disabled={starting}>{#if starting}<LoaderIcon class="animate-spin" />{:else}<PlayIcon weight="fill" />{/if}{t('Başlat')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
