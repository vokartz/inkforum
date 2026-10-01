<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidate, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { fade, slide } from 'svelte/transition';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/Wrench';
  import BroomIcon from 'phosphor-svelte/lib/Broom';
  import UsersIcon from 'phosphor-svelte/lib/UsersThree';
  import RankingIcon from 'phosphor-svelte/lib/Ranking';
  import BellIcon from 'phosphor-svelte/lib/BellSimple';
  import KeyIcon from 'phosphor-svelte/lib/Key';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import ScrollIcon from 'phosphor-svelte/lib/Scroll';
  import LightningIcon from 'phosphor-svelte/lib/Lightning';
  import DatabaseIcon from 'phosphor-svelte/lib/Database';
  import FileSqlIcon from 'phosphor-svelte/lib/FileSql';
  import ArchiveIcon from 'phosphor-svelte/lib/Archive';
  import DownloadIcon from 'phosphor-svelte/lib/DownloadSimple';
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import WarningIcon from 'phosphor-svelte/lib/WarningCircle';
  import TrafficConeIcon from 'phosphor-svelte/lib/TrafficCone';
  import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwise';
  import ClockIcon from 'phosphor-svelte/lib/Clock';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheck';
  import * as Card from '$lib/components/ui/card';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { fileSize, formatDateTime, timeAgo } from '$lib/format';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';
  import type { BackupItem, BackupKind } from './+page';

  let { data } = $props();
  const b = $derived(data.backups);

  const KINDS: Record<BackupKind, { label: string; hint: string; icon: typeof DatabaseIcon }> = {
    db: { label: 'Veritabanı', hint: 'Hızlı anlık kopya (SQLite .db / PostgreSQL dökümü)', icon: DatabaseIcon },
    sql: { label: 'SQL dökümü', hint: 'Okunabilir, taşınabilir .sql.gz dosyası', icon: FileSqlIcon },
    full: { label: 'Tam yedek', hint: 'Veritabanı + yüklenen tüm dosyalar (.tar.gz)', icon: ArchiveIcon },
  };
  function labelOf(l: string): string {
    if (l === 'manual') return t('Elle alındı');
    if (l === 'daily') return t('Günlük');
    if (l === 'uploaded') return t('Yüklendi');
    if (l === 'pre-restore') return t('Geri yükleme öncesi');
    if (l === 'pre-migrate') return t('Veritabanı güncellemesi öncesi');
    if (l.startsWith('pre-update')) return t('Güncelleme öncesi ({version})', { version: l.replace('pre-update-', 'v').replace(/-/g, '.') });
    return l;
  }
  // Geri yükleme onayı için yazılacak sözcük (ziyaretçinin dilinde)
  const confirmWord = $derived(t('GERİ YÜKLE'));

  const last = $derived(b?.items[0] ?? null);
  const total = $derived((b?.items ?? []).reduce((s, x) => s + x.size, 0));

  // ----- Yedek alma -----
  let creating = $state<BackupKind | null>(null);
  async function create(kind: BackupKind) {
    creating = kind;
    try {
      const f = await api.post<BackupItem>('/api/admin/backups', { kind });
      toast.success(t('{kind} yedeği alındı ({size}).', { kind: t(KINDS[kind].label), size: fileSize(f.size) }));
      await invalidate('app:admin-backups');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      creating = null;
    }
  }

  async function remove(f: BackupItem) {
    if (!(await confirmAction({ title: t('Yedek silinsin mi?'), description: f.name, confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/admin/backups/${encodeURIComponent(f.name)}`);
      await invalidate('app:admin-backups');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  // ----- Yükleme (büyük dosyalar için ilerlemeli) -----
  let uploadPct = $state<number | null>(null);
  let dragging = $state(false);
  function upload(file: File) {
    if (!/\.(db|sqlite|sql\.gz|tar\.gz|tgz)$/i.test(file.name)) {
      toast.error(t('InkForum yedeği seçin (.db, .sql.gz ya da .tar.gz).'));
      return;
    }
    const form = new FormData();
    form.append('file', file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/backups/upload');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && (uploadPct = Math.round((e.loaded / e.total) * 100));
    xhr.onload = async () => {
      uploadPct = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success(t('Yedek yüklendi; listeden geri yükleyebilirsin.'));
        await invalidate('app:admin-backups');
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

  // ----- Geri yükleme -----
  let restoreTarget = $state<BackupItem | null>(null);
  let confirmText = $state('');
  let restoring = $state(false);
  let restarting = $state(false);
  async function restore() {
    if (!restoreTarget) return;
    restoring = true;
    try {
      await api.post(`/api/admin/backups/${encodeURIComponent(restoreTarget.name)}/restore`, { confirm: 'GERİ YÜKLE' });
      restoreTarget = null;
      restarting = true;
      // Uygulama yeniden başlıyor: sağlık denetimi yanıt verene kadar bekle
      await new Promise((r) => setTimeout(r, 2500));
      for (let i = 0; i < 120; i++) {
        try {
          const r = await fetch('/api/health', { cache: 'no-store' });
          if (r.ok) break;
        } catch {
          /* henüz açılmadı */
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      window.location.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      restoring = false;
    }
  }

  // ----- Otomatik yedek ayarları -----
  let autoBackup = $state(untrack(() => data.backups?.autoBackup ?? true));
  let keep = $state(untrack(() => data.backups?.keep ?? 7));
  let hour = $state(untrack(() => data.backups?.hour ?? 3));
  let kind = $state<BackupKind>(untrack(() => data.backups?.kind ?? 'db'));
  let savingAuto = $state(false);
  async function saveAuto() {
    savingAuto = true;
    try {
      await api.put('/api/admin/backups/settings', { autoBackup, keep: Number(keep), hour: Number(hour), kind });
      toast.success(t('Otomatik yedek ayarları kaydedildi.'));
      await invalidate('app:admin-backups');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      savingAuto = false;
    }
  }

  // ----- Bakım modu -----
  const settings = $derived(page.data.viewer?.settings ?? {});
  let maintenanceOn = $state(untrack(() => page.data.viewer?.settings['general.maintenanceMode'] === true));
  let maintenanceMsg = $state(untrack(() => String(page.data.viewer?.settings['general.maintenanceMessage'] ?? '')));
  let savingMode = $state(false);
  const modeDirty = $derived(maintenanceOn !== (settings['general.maintenanceMode'] === true) || maintenanceMsg !== String(settings['general.maintenanceMessage'] ?? ''));
  async function saveMode() {
    savingMode = true;
    try {
      await api.put('/api/admin/settings', { 'general.maintenanceMode': maintenanceOn, 'general.maintenanceMessage': maintenanceMsg });
      toast.success(maintenanceOn ? t('Site bakım moduna alındı; yalnızca yöneticiler girebilir.') : t('Site yeniden açık.'));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      savingMode = false;
    }
  }

  // ----- Araçlar -----
  const tasks = [
    { key: 'clear_cache', title: 'Önbelleği temizle', description: 'Ayar, grup, yetki ve diğer önbellekler.', icon: BroomIcon },
    { key: 'recount_groups', title: 'Grup üye sayıları', description: 'Grup listesindeki sayıları düzeltir.', icon: UsersIcon },
    { key: 'recalc_post_groups', title: 'Rütbeleri hesapla', description: 'Mesaj sayısına göre rütbeler.', icon: RankingIcon },
    { key: 'recount_notifications', title: 'Bildirim sayaçları', description: 'Okunmamış bildirim sayıları.', icon: BellIcon },
    { key: 'cleanup_sessions', title: 'Eski oturumlar', description: 'Süresi dolmuş oturumları siler.', icon: KeyIcon },
    { key: 'cleanup_notifications', title: 'Eski bildirimler', description: 'Okunmuş, 90 günden eski.', icon: TrashIcon },
    { key: 'cleanup_logs', title: 'Eski kayıtlar', description: '1 yıldan eski yönetim kayıtları.', icon: ScrollIcon },
    { key: 'optimize_db', title: 'Veritabanını iyileştir', description: 'Boş alanı geri kazanır.', icon: LightningIcon },
  ];
  let running = $state<string | null>(null);
  let doneTasks = $state<string[]>([]);
  async function run(task: string) {
    running = task;
    try {
      await api.post('/api/admin/maintenance', { task });
      doneTasks = [...doneTasks, task];
      toast.success(t('İşlem tamamlandı.'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      running = null;
    }
  }
</script>

<PageHeader
  icon={PageHeaderIcon}
  title={t('Bakım ve yedekler')}
  description={t('Yedek al, indir, yükle ve geri yükle; otomatik yedekleri ayarla; bakım modunu ve veri araçlarını yönet.')}
>
  {#snippet actions()}
    <Button variant="outline" href="/admin/updates"><ArrowsClockwiseIcon />{t('Güncellemeler')}</Button>
  {/snippet}
</PageHeader>

{#if b}
  {#if b.lastRestore && Date.now() - b.lastRestore.at < 24 * 3600_000}
    <div
      class={cn('mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm', b.lastRestore.ok ? 'border-success/40 bg-success/10' : 'border-destructive/40 bg-destructive/10')}
      data-part="restore-result"
    >
      {#if b.lastRestore.ok}<CheckCircleIcon class="mt-0.5 size-5 shrink-0 text-success" weight="fill" />{:else}<WarningIcon class="mt-0.5 size-5 shrink-0 text-destructive" weight="fill" />{/if}
      <div class="grid gap-0.5">
        <b>{b.lastRestore.ok ? t('Geri yükleme tamamlandı') : t('Geri yükleme başarısız')} · {formatDateTime(b.lastRestore.at)}</b>
        <span class="text-muted-foreground">{b.lastRestore.name} — {b.lastRestore.message}{#if b.lastRestore.safety} · {t('Önceki durum: {name}', { name: b.lastRestore.safety })}{/if}</span>
      </div>
    </div>
  {/if}

  <!-- Özet -->
  <div class="mb-6 grid gap-4 sm:grid-cols-3">
    <div class="flex items-center gap-3 rounded-2xl border bg-card p-4">
      <span class="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><ShieldCheckIcon class="size-5" weight="duotone" /></span>
      <div class="min-w-0">
        <p class="text-xs text-muted-foreground">{t('Son yedek')}</p>
        <p class="truncate font-bold">{last ? timeAgo(last.createdAt) : t('Henüz yok')}</p>
      </div>
    </div>
    <div class="flex items-center gap-3 rounded-2xl border bg-card p-4">
      <span class="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><ClockIcon class="size-5" weight="duotone" /></span>
      <div class="min-w-0">
        <p class="text-xs text-muted-foreground">{t('Otomatik yedek')}</p>
        <p class="truncate font-bold">{b.autoBackup ? t('Her gün {time} · {kind}', { time: `${String(b.hour).padStart(2, '0')}:00`, kind: t(KINDS[b.kind].label) }) : t('Kapalı')}</p>
      </div>
    </div>
    <div class="flex items-center gap-3 rounded-2xl border bg-card p-4">
      <span class="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><ArchiveIcon class="size-5" weight="duotone" /></span>
      <div class="min-w-0">
        <p class="text-xs text-muted-foreground">{t('Saklanan yedekler')}</p>
        <p class="truncate font-bold">{t('{n} dosya', { n: b.items.length })} · {fileSize(total)}</p>
      </div>
    </div>
  </div>

  <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <div class="grid min-w-0 content-start gap-6">
      <!-- Yedek al -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">{t('Yeni yedek')}</Card.Title>
          <Card.Description>{t('Yedekler sunucuda')} <code>storage/backups</code> {t('klasöründe tutulur. Bilgisayarına indirip güvenli bir yerde saklamanı öneririz.')}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-3">
          {#if !b.supported}<p class="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{b.reason}</p>{/if}
          <div class="grid gap-3 sm:grid-cols-3">
            {#each Object.entries(KINDS) as [k, info] (k)}
              <button
                type="button"
                disabled={!b.supported || creating !== null}
                onclick={() => create(k as BackupKind)}
                class="group grid gap-2 rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary-soft/40 disabled:pointer-events-none disabled:opacity-60"
              >
                <span class="flex items-center justify-between">
                  <info.icon class="size-6 text-primary" weight="duotone" />
                  {#if creating === k}<LoaderIcon class="size-4 animate-spin" />{/if}
                </span>
                <span class="font-semibold">{t(info.label)}</span>
                <span class="text-xs text-muted-foreground">{t(info.hint)}</span>
              </button>
            {/each}
          </div>
          <!-- Yükleme alanı -->
          <label
            class={cn('flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors', dragging ? 'border-primary bg-primary-soft/40' : 'hover:border-primary/40')}
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
            <input type="file" accept=".db,.sqlite,.gz,.tgz" class="sr-only" onchange={onPick} disabled={uploadPct !== null} />
            <UploadIcon class="size-6 text-muted-foreground" />
            <span class="text-sm font-semibold">{t('Yedek yükle')}</span>
            <span class="text-xs text-muted-foreground">{t('Bir InkForum yedeğini (.db, .sql.gz, .tar.gz) buraya sürükle ya da seç. Başka sunucudan taşımak için de kullanılır.')}</span>
            {#if uploadPct !== null}
              <div class="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted" transition:slide={{ duration: 150 }}>
                <div class="h-full rounded-full bg-primary transition-[width]" style="width:{uploadPct}%"></div>
              </div>
              <span class="text-xs tabular-nums">%{uploadPct}</span>
            {/if}
          </label>
        </Card.Content>
      </Card.Root>

      <!-- Liste -->
      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Yedekler')}</Card.Title></Card.Header>
        <Card.Content class="p-0">
          {#if b.items.length}
            <ul class="divide-y border-t">
              {#each b.items as f (f.name)}
                {@const K = KINDS[f.kind]}
                <li class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><K.icon class="size-5" weight="duotone" /></span>
                  <div class="grid min-w-0 flex-1 basis-48">
                    <span class="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {t(K.label)}
                      <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{labelOf(f.label)}</span>
                    </span>
                    <span class="truncate text-xs text-muted-foreground" title={f.name}>{formatDateTime(f.createdAt)} · {fileSize(f.size)}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" href="/api/admin/backups/{encodeURIComponent(f.name)}/download" download data-sveltekit-reload><DownloadIcon />{t('İndir')}</Button>
                    <Button variant="outline" size="sm" onclick={() => ((restoreTarget = f), (confirmText = ''))} disabled={b.restorePending}><ArrowCounterClockwiseIcon />{t('Geri yükle')}</Button>
                    <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => remove(f)} aria-label={t('Sil')}><TrashIcon /></Button>
                  </div>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="border-t px-5 py-8 text-center text-sm text-muted-foreground">{t('Henüz yedek yok. Yukarıdan ilk yedeğini al.')}</p>
          {/if}
        </Card.Content>
      </Card.Root>

      <!-- Araçlar -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">{t('Veri araçları')}</Card.Title>
          <Card.Description>{t('Sayaçları düzeltme, temizlik ve veritabanı bakımı.')}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-2 sm:grid-cols-2">
          {#each tasks as task (task.key)}
            <div class="flex items-center gap-3 rounded-xl border px-3 py-2.5">
              <task.icon class="size-5 shrink-0 text-muted-foreground" weight="duotone" />
              <div class="grid min-w-0 flex-1">
                <span class="truncate text-sm font-semibold">{t(task.title)}</span>
                <span class="truncate text-xs text-muted-foreground">{t(task.description)}</span>
              </div>
              <Button variant="ghost" size="sm" disabled={running !== null} onclick={() => run(task.key)}>
                {#if running === task.key}<LoaderIcon class="animate-spin" />{:else if doneTasks.includes(task.key)}<CheckIcon class="text-success" />{/if}{t('Çalıştır')}
              </Button>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    </div>

    <div class="grid content-start gap-6">
      <Card.Root>
        <Card.Header>
          <Card.Title class="flex items-center gap-2 text-base"><ClockIcon class="size-4" />{t('Otomatik yedek')}</Card.Title>
        </Card.Header>
        <Card.Content class="grid gap-4">
          <label class="flex items-center justify-between gap-3 text-sm font-medium">{t('Her gün yedek al')}<Switch bind:checked={autoBackup} /></label>
          <label class="grid gap-1.5 text-sm">
            <span class="font-medium">{t('Saat')}</span>
            <select bind:value={hour} class="h-9 rounded-md border bg-background px-2 text-sm" disabled={!autoBackup}>
              {#each Array.from({ length: 24 }, (_, i) => i) as h (h)}<option value={h}>{String(h).padStart(2, '0')}:00</option>{/each}
            </select>
          </label>
          <label class="grid gap-1.5 text-sm">
            <span class="font-medium">{t('Tür')}</span>
            <select bind:value={kind} class="h-9 rounded-md border bg-background px-2 text-sm" disabled={!autoBackup}>
              {#each Object.entries(KINDS) as [k, info] (k)}<option value={k}>{t(info.label)}</option>{/each}
            </select>
          </label>
          <label class="grid gap-1.5 text-sm">
            <span class="font-medium">{t('Saklanacak yedek sayısı')}</span>
            <Input type="number" min={1} max={60} bind:value={keep} />
            <span class="text-xs text-muted-foreground">{t('Her tür için en yeni {n} yedek kalır; eskiler silinir. Yüklenen yedekler silinmez.', { n: keep })}</span>
          </label>
          <Button onclick={saveAuto} disabled={savingAuto}>{#if savingAuto}<LoaderIcon class="animate-spin" />{/if}{t('Kaydet')}</Button>
        </Card.Content>
      </Card.Root>

      <Card.Root class={cn(maintenanceOn && 'border-warning/50')}>
        <Card.Header>
          <Card.Title class="flex items-center gap-2 text-base"><TrafficConeIcon class="size-4" />{t('Bakım modu')}</Card.Title>
          <Card.Description>{t('Açıkken site ziyaretçilere kapanır, yalnızca yöneticiler girebilir.')}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-4">
          <label class="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold">{maintenanceOn ? t('Site bakımda') : t('Site açık')}<Switch bind:checked={maintenanceOn} /></label>
          <label class="grid gap-1.5 text-sm">
            <span class="font-medium">{t('Ziyaretçilere gösterilecek mesaj')}</span>
            <Textarea bind:value={maintenanceMsg} rows={3} maxlength={500} />
          </label>
          <Button onclick={saveMode} disabled={savingMode || !modeDirty} variant={maintenanceOn ? 'destructive' : 'default'}>{#if savingMode}<LoaderIcon class="animate-spin" />{/if}{t('Uygula')}</Button>
        </Card.Content>
      </Card.Root>
    </div>
  </div>
{/if}

<!-- Geri yükleme onayı -->
<Dialog.Root open={!!restoreTarget} onOpenChange={(o) => !o && (restoreTarget = null)}>
  <Dialog.Content class="sm:max-w-lg">
    {#if restoreTarget}
      <Dialog.Header>
        <Dialog.Title>{t('Yedek geri yüklensin mi?')}</Dialog.Title>
        <Dialog.Description>{restoreTarget.name}</Dialog.Description>
      </Dialog.Header>
      <ul class="grid gap-2 text-sm">
        <li class="flex gap-2"><CheckIcon class="mt-0.5 size-4 shrink-0 text-success" />{t('Önce şu anki verilerin yedeği otomatik alınır (geri dönebilirsin).')}</li>
        <li class="flex gap-2"><WarningIcon class="mt-0.5 size-4 shrink-0 text-warning" />{t('Yedekten sonra yapılan tüm konular, mesajlar ve üyelikler kaybolur.')}</li>
        <li class="flex gap-2"><WarningIcon class="mt-0.5 size-4 shrink-0 text-warning" />{t('Site yaklaşık bir dakika yeniden başlar; oturumlar yedekteki hâline döner.')}</li>
        {#if restoreTarget.kind === 'full'}<li class="flex gap-2"><ArchiveIcon class="mt-0.5 size-4 shrink-0" />{t('Yüklenen dosyalar da yedektekilerle değiştirilir.')}</li>{/if}
      </ul>
      <label class="grid gap-1.5 text-sm">
        <span>{t('Onaylamak için')} <b>{confirmWord}</b> {t('yazın')}</span>
        <Input bind:value={confirmText} autocomplete="off" />
      </label>
      <Dialog.Footer>
        <Button variant="ghost" onclick={() => (restoreTarget = null)}>{t('Vazgeç')}</Button>
        <Button variant="destructive" disabled={restoring || confirmText.trim() !== confirmWord} onclick={restore}>
          {#if restoring}<LoaderIcon class="animate-spin" />{:else}<ArrowCounterClockwiseIcon />{/if}{t('Geri yükle')}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>

{#if restarting}
  <div class="fixed inset-0 z-50 grid place-items-center bg-background/90 backdrop-blur" transition:fade>
    <div class="grid justify-items-center gap-3 text-center">
      <LoaderIcon class="size-8 animate-spin text-primary" />
      <p class="text-lg font-bold">{t('Yedek geri yükleniyor…')}</p>
      <p class="max-w-sm text-sm text-muted-foreground">{t('Uygulama yeniden başlıyor. Hazır olunca sayfa kendiliğinden yenilenecek.')}</p>
    </div>
  </div>
{/if}
