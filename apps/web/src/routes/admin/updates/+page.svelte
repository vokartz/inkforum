<script lang="ts">
  import {
    AUTO_INSTALL_INFO,
    AUTO_INSTALL_MODES,
    DEPLOY_MODE_INFO,
    compareVersions,
    type ReleaseInfo,
    type UpdateJob,
    type UpdateSettingsInput,
  } from '@forum/shared';
  import { untrack } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { slide, fade } from 'svelte/transition';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/ArrowsClockwise';
  import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwise';
  import RocketIcon from 'phosphor-svelte/lib/RocketLaunch';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import WarningIcon from 'phosphor-svelte/lib/WarningCircle';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import GithubIcon from 'phosphor-svelte/lib/GithubLogo';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDown';
  import ArrowUUpLeftIcon from 'phosphor-svelte/lib/ArrowUUpLeft';
  import SealCheckIcon from 'phosphor-svelte/lib/SealCheck';
  import DatabaseIcon from 'phosphor-svelte/lib/Database';
  import DownloadIcon from 'phosphor-svelte/lib/DownloadSimple';
  import GearIcon from 'phosphor-svelte/lib/GearSix';
  import FloppyIcon from 'phosphor-svelte/lib/FloppyDisk';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheck';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import { Badge } from '$lib/components/ui/badge';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDate, formatDateTime, timeAgo } from '$lib/format';
  import { localeTag, t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';

  let { data } = $props();
  const u = $derived(data.updates);

  // ----- Denetim -----
  let checking = $state(false);
  async function checkNow() {
    checking = true;
    try {
      await api.get('/api/admin/updates?refresh=1');
      await invalidate('app:admin-updates');
      toast.success(u?.available ? t('Yeni sürüm var: v{version}', { version: u.latest?.version }) : t('Denetim tamamlandı.'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      checking = false;
    }
  }

  // ----- Kurulum ve canlı ilerleme -----
  let job = $state<UpdateJob | null>(untrack(() => data.updates?.job ?? null));
  let offline = $state(false);
  let polling = false;
  const RUNNING = ['backup', 'download', 'install', 'restart', 'verify'];
  const running = $derived(!!job && RUNNING.includes(job.state));
  const STEPS = [
    { key: 'backup', label: 'Yedek' },
    { key: 'download', label: 'İndirme' },
    { key: 'install', label: 'Kurulum' },
    { key: 'restart', label: 'Yeniden başlatma' },
    { key: 'verify', label: 'Doğrulama' },
  ];
  const stepIndex = $derived(job ? (job.state === 'done' ? STEPS.length : STEPS.findIndex((s) => s.key === job!.state)) : -1);

  async function poll() {
    if (polling) return;
    polling = true;
    const startedVersion = u?.current.version;
    try {
      for (let i = 0; i < 400; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        try {
          const s = await api.get<{ job: UpdateJob | null; current: { version: string } }>('/api/admin/updates');
          offline = false;
          job = s.job;
          if (s.current.version !== startedVersion) {
            toast.success(t('InkForum v{version} sürümüne güncellendi.', { version: s.current.version }));
            setTimeout(() => window.location.reload(), 1200);
            return;
          }
          if (!job || !RUNNING.includes(job.state)) {
            await invalidate('app:admin-updates');
            return;
          }
        } catch {
          // Uygulama yeniden başlıyor: kısa süre yanıt vermez
          offline = true;
        }
      }
    } finally {
      polling = false;
    }
  }
  $effect(() => {
    if (running) void poll();
  });

  async function install(r: ReleaseInfo) {
    const downgrade = u && compareVersions(r.version, u.current.version) < 0;
    const ok = await confirmAction({
      title: downgrade ? t('v{version} sürümüne geri dönülsün mü?', { version: r.version }) : t('InkForum v{version} kurulsun mu?', { version: r.version }),
      description: downgrade
        ? t('Eski sürüm, yeni sürümün veritabanı değişiklikleriyle uyumsuz olabilir. Önce yedek alınır; sorun olursa yedekten dönebilirsiniz.')
        : t('Önce veritabanı yedeği alınır, ardından yeni sürüm indirilip kurulur. Site 1–2 dakika kısa süreliğine yanıt vermeyebilir.'),
      confirmLabel: downgrade ? t('Geri dön') : t('Güncellemeyi başlat'),
      destructive: !!downgrade,
    });
    if (!ok) return;
    try {
      job = await api.post<UpdateJob>('/api/admin/updates/install', { version: r.version });
      void poll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function rollback() {
    const ok = await confirmAction({
      title: t('Önceki sürüme dönülsün mü?'),
      description: t('Saklanan önceki sürüm dosyaları geri yüklenir ve uygulama yeniden başlatılır.'),
      confirmLabel: t('Geri dön'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.post('/api/admin/updates/rollback', {});
      job = { state: 'restart', version: null, from: u?.current.version ?? null, startedAt: Date.now(), finishedAt: null, log: [{ at: Date.now(), message: t('Önceki sürüm geri yükleniyor…'), level: 'info' }], error: null };
      void poll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  // ----- Ayarlar -----
  let prefs = $state<UpdateSettingsInput>(untrack(() => ({ ...(data.updates?.settings ?? { autoCheck: true, channel: 'stable', autoInstall: 'off', installHour: 4, notifyAdmins: true }) })));
  let saving = $state(false);
  async function savePrefs() {
    saving = true;
    try {
      await api.put('/api/admin/updates/settings', prefs);
      toast.success(t('Güncelleme ayarları kaydedildi.'));
      await invalidate('app:admin-updates');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }

  // ----- Coolify ile güncelleme (tek imajla kurulumlar) -----
  let coolifyUrl = $state(untrack(() => data.updates?.coolify?.webhookUrl ?? ''));
  let coolifyToken = $state('');
  let coolifySaving = $state(false);
  async function saveCoolify(remove = false) {
    coolifySaving = true;
    try {
      await api.put('/api/admin/updates/coolify', remove ? { webhookUrl: '', token: '' } : { webhookUrl: coolifyUrl.trim(), token: coolifyToken.trim() });
      if (remove) coolifyUrl = '';
      coolifyToken = '';
      toast.success(remove ? t('Coolify bağlantısı kaldırıldı.') : t('Coolify bağlantısı kaydedildi.'));
      await invalidate('app:admin-updates');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      coolifySaving = false;
    }
  }

  // ----- Sürüm geçmişi -----
  let expanded = $state<string | null>(null);
  const kindLabel = { major: 'Ana sürüm', minor: 'Yeni özellikler', patch: 'Düzeltme', pre: 'Ön sürüm' } as const;
</script>

<PageHeader
  icon={PageHeaderIcon}
  title={t('Güncellemeler')}
  description={t('InkForum sürümü, sürüm notları ve otomatik güncelleme. Güncellemeler GitHub üzerinden yayımlanır ve kurulmadan önce veritabanı yedeği alınır.')}
>
  {#snippet actions()}
    <Button variant="outline" onclick={checkNow} disabled={checking || running}>
      {#if checking}<LoaderIcon class="animate-spin" />{:else}<ArrowsClockwiseIcon />{/if}{t('Şimdi denetle')}
    </Button>
  {/snippet}
</PageHeader>

{#if u}
  <div class="grid gap-6 xl:grid-cols-[1fr_22rem]">
    <div class="grid min-w-0 content-start gap-6">
      <!-- Durum -->
      <section class={cn('relative overflow-hidden rounded-2xl border p-6', u.available ? 'border-primary/40 bg-primary-soft/40' : 'bg-card')} data-part="update-hero">
        <div class="flex flex-wrap items-start gap-5">
          <img src="/brand/inkforum-icon-192.png" alt="" class="size-16 rounded-2xl shadow-md" />
          <div class="grid min-w-0 flex-1 gap-1">
            <p class="text-sm text-muted-foreground">{t('Kurulu sürüm')}</p>
            <p class="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight">
              InkForum v{u.current.version}
              <Badge variant="secondary">{t(DEPLOY_MODE_INFO[u.current.deploy].label)}</Badge>
              {#if u.current.build}<span class="font-mono text-xs font-normal text-muted-foreground">{u.current.build}</span>{/if}
            </p>
            <p class="text-sm text-muted-foreground">
              {#if u.checkedAt}{t('Son denetim {time}', { time: timeAgo(u.checkedAt) })}{:else}{t('Henüz denetlenmedi')}{/if} · <a class="inline-flex items-center gap-1 underline underline-offset-2" href="https://github.com/{u.repo}/releases" target="_blank" rel="noopener noreferrer"><GithubIcon class="size-3.5" />{u.repo}</a>
            </p>
          </div>
          {#if !u.available && !u.checkError && u.checkedAt}
            <span class="flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-sm font-semibold text-success"><SealCheckIcon class="size-4" weight="fill" />{t('Güncel')}</span>
          {/if}
        </div>
        {#if u.checkError}
          <p class="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"><WarningIcon class="mt-0.5 size-4 shrink-0" weight="fill" />{u.checkError}</p>
        {/if}
        {#if u.updater && !u.updater.reachable && !u.coolify?.configured}
          <p class="mt-4 flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm" data-part="updater-unreachable"><WarningIcon class="mt-0.5 size-4 shrink-0 text-warning" weight="fill" />{u.updater.error}</p>
        {/if}
      </section>

      <!-- İlerleme -->
      {#if job && job.state !== 'idle'}
        <Card.Root>
          <Card.Header>
            <Card.Title class="flex items-center gap-2 text-base">
              {#if running}<LoaderIcon class="size-4 animate-spin text-primary" />{:else if job.state === 'done'}<CheckCircleIcon class="size-5 text-success" weight="fill" />{:else}<WarningIcon class="size-5 text-destructive" weight="fill" />{/if}
              {running
                ? t('v{version} kuruluyor', { version: job.version ?? '' })
                : job.state === 'done'
                  ? t('v{version} kuruldu', { version: job.version ?? '' })
                  : job.state === 'rolledback'
                    ? t('Güncelleme geri alındı')
                    : t('Güncelleme başarısız')}
            </Card.Title>
            {#if job.startedAt}<Card.Description>{t('Başladı: {date}', { date: formatDateTime(job.startedAt) })}{#if job.from} · v{job.from} → v{job.version}{/if}</Card.Description>{/if}
          </Card.Header>
          <Card.Content class="grid gap-4">
            <ol class="grid grid-cols-5 gap-1.5" aria-label={t('Güncelleme adımları')}>
              {#each STEPS as s, i (s.key)}
                <li class="grid gap-1.5">
                  <span class={cn('h-1.5 rounded-full transition-colors duration-500', i < stepIndex || job.state === 'done' ? 'bg-success' : i === stepIndex && running ? 'animate-pulse bg-primary' : 'bg-muted')}></span>
                  <span class={cn('truncate text-[11px] font-medium', i <= stepIndex ? 'text-foreground' : 'text-muted-foreground')}>{t(s.label)}</span>
                </li>
              {/each}
            </ol>
            {#if offline && running}
              <p class="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm" in:fade><LoaderIcon class="size-4 animate-spin" />{t('Uygulama yeniden başlıyor; birazdan sayfa kendiliğinden yenilenecek…')}</p>
            {/if}
            {#if job.error}<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{job.error}</p>{/if}
            {#if job.log.length}
              <pre class="max-h-64 overflow-auto rounded-xl bg-[#0d0f14] p-3 font-mono text-xs leading-relaxed text-white/80">{#each job.log as l, i (i)}<span class={cn('block', l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-300' : '')}>{new Date(l.at).toLocaleTimeString(localeTag())}  {l.message}</span>{/each}</pre>
            {/if}
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- Yeni sürüm -->
      {#if u.latest}
        <Card.Root class="overflow-hidden border-primary/30">
          <div class="flex flex-wrap items-center gap-3 border-b bg-gradient-to-r from-primary/15 to-transparent px-6 py-5">
            <RocketIcon class="size-7 text-primary" weight="duotone" />
            <div class="grid min-w-0 flex-1">
              <span class="text-xs font-semibold text-primary uppercase">{t('Yeni sürüm')}{#if u.kind} · {t(kindLabel[u.kind])}{/if}</span>
              <span class="text-xl font-extrabold">{u.latest.name}</span>
              <span class="text-xs text-muted-foreground">{formatDate(u.latest.publishedAt)} · v{u.current.version} → v{u.latest.version}</span>
            </div>
            {#if u.canInstall}
              <Button size="lg" onclick={() => install(u.latest!)} disabled={running}><DownloadIcon />{t('Şimdi güncelle')}</Button>
            {:else}
              <Button variant="outline" href={u.latest.url} target="_blank" rel="noopener noreferrer"><GithubIcon />{t('GitHub’da gör')}</Button>
            {/if}
          </div>
          <Card.Content class="grid gap-4 pt-5">
            <div class="prose-forum release-notes text-sm">{@html u.latest.notesHtml}</div>
            {#if !u.canInstall && u.installBlocker}
              <p class="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"><WarningIcon class="mt-0.5 size-4 shrink-0" />{u.installBlocker}</p>
            {/if}
            <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span class="flex items-center gap-1"><DatabaseIcon class="size-3.5" />{t('Kurulumdan önce otomatik yedek')}</span>
              <span class="flex items-center gap-1"><ShieldCheckIcon class="size-3.5" />{t('Paket imzası (SHA-256) doğrulanır')}</span>
              <span class="flex items-center gap-1"><ArrowUUpLeftIcon class="size-3.5" />{t('Sorun olursa otomatik geri dönüş')}</span>
            </p>
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- Sürüm geçmişi -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">{t('Sürüm geçmişi')}</Card.Title>
          <Card.Description>{t('Tüm yayımlanan sürümler ve değişiklik notları.')}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-0 p-0">
          {#each u.releases as r (r.version)}
            {@const isCurrent = r.version === u.current.version}
            {@const newer = compareVersions(r.version, u.current.version) > 0}
            <div class="border-t first:border-t-0">
              <button type="button" class="flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-muted/40" onclick={() => (expanded = expanded === r.version ? null : r.version)} aria-expanded={expanded === r.version}>
                <span class={cn('size-2.5 shrink-0 rounded-full', isCurrent ? 'bg-success' : newer ? 'bg-primary' : 'bg-muted-foreground/30')}></span>
                <span class="grid min-w-0 flex-1">
                  <span class="flex flex-wrap items-center gap-2 font-semibold">
                    v{r.version}
                    {#if isCurrent}<Badge class="bg-success text-white">{t('Kurulu')}</Badge>{/if}
                    {#if r.prerelease}<Badge variant="outline">{t('Ön sürüm')}</Badge>{/if}
                  </span>
                  <span class="truncate text-xs text-muted-foreground">{r.name} · {formatDate(r.publishedAt)}</span>
                </span>
                <CaretDownIcon class={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded === r.version && 'rotate-180')} />
              </button>
              {#if expanded === r.version}
                <div class="grid gap-3 px-6 pb-5 pl-11" transition:slide={{ duration: 180 }}>
                  <div class="prose-forum release-notes text-sm">{#if r.notesHtml}{@html r.notesHtml}{:else}<p>{t('Not yok.')}</p>{/if}</div>
                  <div class="flex flex-wrap gap-2">
                    <Button variant="ghost" size="sm" href={r.url} target="_blank" rel="noopener noreferrer"><GithubIcon />GitHub</Button>
                    {#if u.canInstall && !isCurrent}
                      <Button variant="outline" size="sm" onclick={() => install(r)} disabled={running}>{newer ? t('Bu sürümü kur') : t('Bu sürüme dön')}</Button>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <p class="px-6 py-8 text-center text-sm text-muted-foreground">{u.checkedAt ? t('Henüz yayımlanmış sürüm yok.') : t('"Şimdi denetle" ile sürüm listesini getir.')}</p>
          {/each}
        </Card.Content>
      </Card.Root>
    </div>

    <!-- Ayarlar -->
    <div class="grid content-start gap-6">
      <Card.Root>
        <Card.Header><Card.Title class="flex items-center gap-2 text-base"><GearIcon class="size-4" />{t('Otomatik güncelleme')}</Card.Title></Card.Header>
        <Card.Content class="grid gap-4">
          <label class="flex items-center justify-between gap-3 text-sm"><span>{t('Yeni sürümleri otomatik denetle')}<span class="block text-xs text-muted-foreground">{t('6 saatte bir GitHub’a bakılır.')}</span></span><Switch bind:checked={prefs.autoCheck} /></label>
          <label class="flex items-center justify-between gap-3 text-sm"><span>{t('Yöneticilere bildir')}<span class="block text-xs text-muted-foreground">{t('Yeni sürümde bildirim gönderilir.')}</span></span><Switch bind:checked={prefs.notifyAdmins} /></label>
          <div class="grid gap-1.5">
            <span class="text-sm font-medium">{t('Kanal')}</span>
            <div class="flex rounded-lg bg-muted p-1">
              {#each [['stable', 'Kararlı'], ['beta', 'Beta']] as const as [v, l] (v)}
                <button type="button" class={cn('flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors', prefs.channel === v ? 'bg-card shadow-sm' : 'text-muted-foreground')} onclick={() => (prefs.channel = v)}>{t(l)}</button>
              {/each}
            </div>
          </div>
          <div class="grid gap-1.5">
            <span class="text-sm font-medium">{t('Otomatik kurulum')}</span>
            {#each AUTO_INSTALL_MODES as m (m)}
              <label class={cn('flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors', prefs.autoInstall === m ? 'border-primary/50 bg-primary-soft' : 'hover:bg-muted/50', !u.canInstall && m !== 'off' && 'pointer-events-none opacity-50')}>
                <input type="radio" name="autoInstall" value={m} bind:group={prefs.autoInstall} class="mt-1 accent-[var(--primary)]" disabled={!u.canInstall && m !== 'off'} />
                <span class="grid"><span class="text-sm font-semibold">{t(AUTO_INSTALL_INFO[m].label)}</span><span class="text-xs text-muted-foreground">{t(AUTO_INSTALL_INFO[m].description)}</span></span>
              </label>
            {/each}
          </div>
          {#if prefs.autoInstall !== 'off'}
            <label class="grid gap-1.5 text-sm" transition:slide={{ duration: 150 }}>
              <span class="font-medium">{t('Kurulum saati')}</span>
              <select bind:value={prefs.installHour} class="h-9 rounded-md border bg-background px-2 text-sm">
                {#each Array.from({ length: 24 }, (_, i) => i) as h (h)}<option value={h}>{String(h).padStart(2, '0')}:00</option>{/each}
              </select>
              <span class="text-xs text-muted-foreground">{t('Ziyaretçinin en az olduğu saati seç (sunucu saati).')}</span>
            </label>
          {/if}
          <Button onclick={savePrefs} disabled={saving}>{#if saving}<LoaderIcon class="animate-spin" />{:else}<FloppyIcon />{/if}{t('Kaydet')}</Button>
        </Card.Content>
      </Card.Root>

      {#if u.coolify}
        <Card.Root class={cn(u.coolify.detected && !u.coolify.configured && 'border-primary/40')} data-part="coolify-updates">
          <Card.Header>
            <Card.Title class="flex items-center gap-2 text-base"><RocketIcon class="size-4" />{t('Coolify ile güncelleme')}</Card.Title>
            <Card.Description>
              {u.coolify.configured
                ? t('Güncellemeler Coolify’ın yeniden dağıtımıyla kurulur.')
                : t('Forumu Coolify’da tek imaj olarak kurduysanız güncelleyici kapsayıcısı yoktur; güncellemeler Coolify’ın Deploy Webhook’u ile kurulabilir.')}
            </Card.Description>
          </Card.Header>
          <Card.Content class="grid gap-3 text-sm">
            <ol class="grid list-decimal gap-1 pl-4 text-xs text-muted-foreground">
              <li>{t('Coolify’da forum kaynağının imaj etiketi "latest" olsun.')}</li>
              <li>{t('Kaynağın Webhooks sekmesindeki "Deploy Webhook" adresini kopyalayın.')}</li>
              <li>{t('Keys & Tokens → API tokens bölümünden "deploy" yetkili bir anahtar oluşturun.')}</li>
            </ol>
            <label class="grid gap-1.5">
              <span class="text-xs font-semibold">{t('Deploy Webhook adresi')}</span>
              <input bind:value={coolifyUrl} placeholder="https://coolify.example.com/api/v1/deploy?uuid=…" class="h-9 rounded-md border bg-background px-3 font-mono text-xs outline-none focus:border-ring" />
            </label>
            <label class="grid gap-1.5">
              <span class="text-xs font-semibold">{t('API anahtarı')}</span>
              <input type="password" bind:value={coolifyToken} placeholder={u.coolify.hasToken ? t('Kayıtlı (değiştirmek için yazın)') : ''} autocomplete="off" class="h-9 rounded-md border bg-background px-3 font-mono text-xs outline-none focus:border-ring" />
            </label>
            <div class="flex flex-wrap gap-2">
              <Button size="sm" onclick={() => saveCoolify()} disabled={coolifySaving || !coolifyUrl.trim()}>{#if coolifySaving}<LoaderIcon class="animate-spin" />{:else}<FloppyIcon />{/if}{t('Kaydet')}</Button>
              {#if u.coolify.configured}<Button size="sm" variant="ghost" class="text-destructive" onclick={() => saveCoolify(true)} disabled={coolifySaving}>{t('Kaldır')}</Button>{/if}
            </div>
          </Card.Content>
        </Card.Root>
      {/if}

      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Kurulum yöntemi')}</Card.Title></Card.Header>
        <Card.Content class="grid gap-3 text-sm">
          <p class="font-semibold">{t(DEPLOY_MODE_INFO[u.current.deploy].label)}</p>
          <p class="text-muted-foreground">{t(DEPLOY_MODE_INFO[u.current.deploy].description)}</p>
          <dl class="grid gap-1.5 text-xs">
            <div class="flex justify-between gap-2"><dt class="text-muted-foreground">Node.js</dt><dd class="font-mono">{u.current.node}</dd></div>
            <div class="flex justify-between gap-2"><dt class="text-muted-foreground">{t('Kaynak')}</dt><dd class="truncate font-mono">{u.repo}</dd></div>
          </dl>
          {#if u.hasPrevious}
            <Button variant="outline" size="sm" onclick={rollback} disabled={running}><ArrowUUpLeftIcon />{t('Önceki sürüme dön')}</Button>
          {/if}
          <a href="/admin/maintenance" class="text-xs text-primary underline underline-offset-2">{t('Yedekleri yönet →')}</a>
        </Card.Content>
      </Card.Root>
    </div>
  </div>
{/if}

<style>
  .release-notes :global(h3),
  .release-notes :global(h4) {
    font-size: 0.95rem;
    font-weight: 700;
    margin: 1em 0 0.4em;
  }
  .release-notes :global(hr) {
    margin: 1em 0;
    border-color: var(--border);
  }
  .release-notes :global(.md-task[data-done='true']) {
    text-decoration: line-through;
    opacity: 0.7;
  }
</style>
