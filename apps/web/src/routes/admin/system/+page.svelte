<script lang="ts">
  import { DEPLOY_MODE_INFO } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/HardDrives';
  import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwise';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import BugIcon from 'phosphor-svelte/lib/Bug';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import WarningIcon from 'phosphor-svelte/lib/WarningCircle';
  import XCircleIcon from 'phosphor-svelte/lib/XCircle';
  import CpuIcon from 'phosphor-svelte/lib/Cpu';
  import DatabaseIcon from 'phosphor-svelte/lib/Database';
  import HardDriveIcon from 'phosphor-svelte/lib/HardDrive';
  import MemoryIcon from 'phosphor-svelte/lib/Memory';
  import ClockIcon from 'phosphor-svelte/lib/Clock';
  import PackageIcon from 'phosphor-svelte/lib/Package';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { fileSize, formatDateTime, formatNumber } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const s = $derived(data.system);

  const TABLES: Record<string, string> = {
    users: 'Üyeler',
    topics: 'Konular',
    posts: 'Mesajlar',
    conversation_messages: 'Özel mesajlar',
    member_groups: 'Gruplar',
    sessions: 'Oturumlar',
    notifications: 'Bildirimler',
    audit_log: 'Denetim kayıtları',
    files: 'Dosyalar',
    jobs: 'İşler',
  };

  function uptime(sec: number): string {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return [d && t('{n} gün', { n: d }), h && t('{n} sa', { n: h }), t('{n} dk', { n: m })].filter(Boolean).join(' ');
  }
  const pct = (used: number, total: number) => (total ? Math.min(100, Math.round((used / total) * 100)) : 0);

  let refreshing = $state(false);
  async function refresh() {
    refreshing = true;
    await invalidate('app:admin-system');
    refreshing = false;
  }

  /** Destek talebi için özet (gizli bilgi içermez) */
  function reportLines(): string[] {
    if (!s) return [];
    return [
      `InkForum v${s.app.version} (${s.app.build ?? t('yerel')}) · ${t(DEPLOY_MODE_INFO[s.app.deploy].label)}`,
      `Node ${s.runtime.node} · ${s.runtime.platform} · ${s.runtime.os}`,
      t('Veritabanı: {version} · {size} · şema {applied}/{pending} bekleyen', { version: s.database.version, size: s.database.sizeBytes !== null ? fileSize(s.database.sizeBytes) : '?', applied: s.database.migrations.applied, pending: s.database.migrations.pending }),
      t('Bellek: RSS {rss} · sistem {used}/{total}', { rss: fileSize(s.runtime.rss), used: fileSize(s.runtime.memTotal - s.runtime.memFree), total: fileSize(s.runtime.memTotal) }),
      t('E-posta: {mail} · Görsel: {images} · İşler: {worker}', { mail: s.services.mail, images: s.services.images, worker: s.services.worker ? t('açık') : t('kapalı') }),
      ...s.checks.map((c) => `[${c.status}] ${c.label}: ${c.detail}`),
    ];
  }
  async function copyReport() {
    await navigator.clipboard.writeText(reportLines().join('\n'));
    toast.success(t('Sistem özeti panoya kopyalandı.'));
  }
  /** GitHub hata formunu sürüm ve sistem özetiyle doldurarak açar */
  const issueUrl = $derived(
    s
      ? `https://github.com/vokartz/inkforum/issues/new?${new URLSearchParams({ template: 'bug_report.yml', version: s.app.version, system: reportLines().join('\n') })}`
      : 'https://github.com/vokartz/inkforum/issues/new/choose',
  );
</script>

<PageHeader icon={PageHeaderIcon} title={t('Sistem bilgisi')} description={t('Sürüm, sunucu, veritabanı ve depolama durumu. Destek isterken özeti kopyalayıp paylaşabilirsin.')}>
  {#snippet actions()}
    <Button variant="outline" href={issueUrl} target="_blank" rel="noopener noreferrer"><BugIcon />{t("GitHub'da hata bildir")}</Button>
    <Button variant="outline" onclick={copyReport} disabled={!s}><CopyIcon />{t('Özeti kopyala')}</Button>
    <Button variant="outline" onclick={refresh} disabled={refreshing}><ArrowsClockwiseIcon class={cn(refreshing && 'animate-spin')} />{t('Yenile')}</Button>
  {/snippet}
</PageHeader>

{#if s}
  <!-- Özet kutucukları -->
  <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <a href="/admin/updates" class="group flex items-center gap-4 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40">
      <img src="/brand/inkforum-icon-192.png" alt="" class="size-11 rounded-xl" />
      <div class="min-w-0">
        <p class="text-xs text-muted-foreground">InkForum</p>
        <p class="text-lg font-extrabold">v{s.app.version}</p>
        <p class="truncate text-xs text-muted-foreground">{t(DEPLOY_MODE_INFO[s.app.deploy].label)}{s.app.build ? ` · ${s.app.build}` : ''}</p>
      </div>
    </a>
    <div class="flex items-center gap-4 rounded-2xl border bg-card p-4">
      <span class="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><ClockIcon class="size-6" weight="duotone" /></span>
      <div class="min-w-0">
        <p class="text-xs text-muted-foreground">{t('Çalışma süresi')}</p>
        <p class="text-lg font-extrabold">{uptime(s.app.uptimeSec)}</p>
        <p class="truncate text-xs text-muted-foreground">{t('Başlangıç {date}', { date: formatDateTime(s.app.startedAt) })}</p>
      </div>
    </div>
    <div class="grid gap-2 rounded-2xl border bg-card p-4">
      <p class="flex items-center gap-2 text-xs text-muted-foreground"><MemoryIcon class="size-4" />{t('Bellek (uygulama {size})', { size: fileSize(s.runtime.rss) })}</p>
      <div class="h-2 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary" style="width:{pct(s.runtime.memTotal - s.runtime.memFree, s.runtime.memTotal)}%"></div></div>
      <p class="text-xs text-muted-foreground">{t('{used} / {total} kullanımda', { used: fileSize(s.runtime.memTotal - s.runtime.memFree), total: fileSize(s.runtime.memTotal) })}</p>
    </div>
    <div class="grid gap-2 rounded-2xl border bg-card p-4">
      <p class="flex items-center gap-2 text-xs text-muted-foreground"><HardDriveIcon class="size-4" />{t('Disk')}</p>
      {#if s.storage.disk}
        <div class="h-2 overflow-hidden rounded-full bg-muted">
          <div class={cn('h-full rounded-full', pct(s.storage.disk.total - s.storage.disk.free, s.storage.disk.total) > 90 ? 'bg-destructive' : 'bg-primary')} style="width:{pct(s.storage.disk.total - s.storage.disk.free, s.storage.disk.total)}%"></div>
        </div>
        <p class="text-xs text-muted-foreground">{t('{free} boş / {total}', { free: fileSize(s.storage.disk.free), total: fileSize(s.storage.disk.total) })}</p>
      {:else}<p class="text-xs text-muted-foreground">{t('Bilgi alınamadı')}</p>{/if}
    </div>
  </div>

  <div class="grid gap-6 lg:grid-cols-2">
    <!-- Sağlık denetimleri -->
    <Card.Root class="lg:col-span-2">
      <Card.Header><Card.Title class="text-base">{t('Sağlık denetimleri')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {#each s.checks as c (c.key)}
          {@const Icon = c.status === 'ok' ? CheckCircleIcon : c.status === 'warn' ? WarningIcon : XCircleIcon}
          <div class={cn('flex items-start gap-2.5 rounded-xl border p-3', c.status === 'fail' && 'border-destructive/40 bg-destructive/5', c.status === 'warn' && 'border-warning/40 bg-warning/5')}>
            <Icon class={cn('mt-0.5 size-5 shrink-0', c.status === 'ok' ? 'text-success' : c.status === 'warn' ? 'text-warning' : 'text-destructive')} weight="fill" />
            <div class="grid min-w-0">
              <span class="text-sm font-semibold">{c.label}</span>
              <span class="text-xs break-words text-muted-foreground">{c.detail}</span>
            </div>
          </div>
        {/each}
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="flex items-center gap-2 text-base"><PackageIcon class="size-4" />{t('Uygulama')}</Card.Title></Card.Header>
      <Card.Content>
        <dl class="info-list">
          <div><dt>{t('Sürüm')}</dt><dd>InkForum v{s.app.version}</dd></div>
          <div><dt>{t('Kurulum')}</dt><dd>{t(DEPLOY_MODE_INFO[s.app.deploy].label)}</dd></div>
          <div><dt>{t('Ortam')}</dt><dd>{s.app.env}</dd></div>
          <div><dt>{t('Adres')}</dt><dd class="truncate">{s.app.appUrl}</dd></div>
          <div><dt>{t('Güvenli çerezler')}</dt><dd>{s.app.secureCookies ? t('Evet (HTTPS)') : t('Hayır')}</dd></div>
          <div><dt>{t('Vekil güveni')}</dt><dd>{s.app.trustProxy}</dd></div>
          <div><dt>{t('Saat dilimi')}</dt><dd>{s.app.timezone}</dd></div>
          <div><dt>{t('E-posta')}</dt><dd>{s.services.mail}</dd></div>
          <div><dt>{t('Görsel işleme')}</dt><dd>{s.services.images}</dd></div>
        </dl>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="flex items-center gap-2 text-base"><CpuIcon class="size-4" />{t('Sunucu')}</Card.Title></Card.Header>
      <Card.Content>
        <dl class="info-list">
          <div><dt>Node.js</dt><dd>{s.runtime.node}</dd></div>
          <div><dt>{t('Platform')}</dt><dd>{s.runtime.platform}</dd></div>
          <div><dt>{t('İşletim sistemi')}</dt><dd class="truncate">{s.runtime.os}</dd></div>
          <div><dt>{t('İşlemci')}</dt><dd class="truncate">{t('{n} çekirdek', { n: s.runtime.cpus })}{s.runtime.cpuModel ? ` · ${s.runtime.cpuModel}` : ''}</dd></div>
          <div><dt>{t('Yük (1/5/15 dk)')}</dt><dd>{s.runtime.load.join(' / ')}</dd></div>
          <div><dt>{t('Uygulama belleği')}</dt><dd>{fileSize(s.runtime.rss)} (heap {fileSize(s.runtime.heapUsed)} / {fileSize(s.runtime.heapTotal)})</dd></div>
          <div><dt>{t('Süreç')}</dt><dd>PID {s.app.pid}</dd></div>
        </dl>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="flex items-center gap-2 text-base"><DatabaseIcon class="size-4" />{t('Veritabanı')}</Card.Title></Card.Header>
      <Card.Content>
        <dl class="info-list">
          <div><dt>{t('Sürücü')}</dt><dd>{s.database.version || s.database.driver}</dd></div>
          {#if s.database.sizeBytes !== null}<div><dt>{t('Boyut')}</dt><dd>{fileSize(s.database.sizeBytes)}</dd></div>{/if}
          {#if s.database.journal}<div><dt>{t('Günlük modu')}</dt><dd>{s.database.journal}</dd></div>{/if}
          <div><dt>{t('Şema')}</dt><dd>{t('{n} güncelleme', { n: s.database.migrations.applied })}{s.database.migrations.pending ? ` · ${t('{n} bekleyen', { n: s.database.migrations.pending })}` : ` · ${t('güncel')}`}</dd></div>
          {#each Object.entries(s.database.counts) as [table, n] (table)}
            <div><dt>{TABLES[table] ? t(TABLES[table]) : table}</dt><dd class="tabular-nums">{formatNumber(n)}</dd></div>
          {/each}
        </dl>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="flex items-center gap-2 text-base"><HardDriveIcon class="size-4" />{t('Depolama ve işler')}</Card.Title></Card.Header>
      <Card.Content>
        <dl class="info-list">
          <div><dt>{t('Yüklenen dosyalar')}</dt><dd>{t('{n} dosya', { n: formatNumber(s.storage.uploadsFiles) })} · {fileSize(s.storage.uploadsBytes)}</dd></div>
          <div><dt>{t('Klasör')}</dt><dd class="truncate font-mono text-xs">{s.storage.dir}</dd></div>
          <div><dt>{t('Arka plan işleri')}</dt><dd>{s.services.worker ? t('Çalışıyor') : t('Kapalı')}</dd></div>
          {#each Object.entries(s.services.jobs) as [k, n] (k)}
            <div><dt>{t('İş: {name}', { name: k })}</dt><dd class="tabular-nums">{formatNumber(n)}</dd></div>
          {/each}
        </dl>
        <div class="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" href="/admin/maintenance">{t('Bakım ve yedekler')}</Button>
          <Button variant="outline" size="sm" href="/admin/jobs">{t('İşler')}</Button>
        </div>
      </Card.Content>
    </Card.Root>
  </div>
{/if}

<style>
  .info-list {
    display: grid;
    gap: 0;
    font-size: 0.875rem;
  }
  .info-list > div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.45rem 0;
    border-bottom: 1px dashed var(--border);
    min-width: 0;
  }
  .info-list > div:last-child {
    border-bottom: 0;
  }
  .info-list dt {
    color: var(--muted-foreground);
    flex-shrink: 0;
  }
  .info-list dd {
    text-align: right;
    min-width: 0;
  }
</style>
