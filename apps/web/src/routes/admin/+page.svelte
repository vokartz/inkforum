<script lang="ts">
  import SquaresIcon from 'phosphor-svelte/lib/SquaresFour';
  import ChatsIcon from 'phosphor-svelte/lib/ChatsCircle';
  import ChatTextIcon from 'phosphor-svelte/lib/ChatText';
  import UserPlusIcon from 'phosphor-svelte/lib/UserPlus';
  import BroadcastIcon from 'phosphor-svelte/lib/Broadcast';
  import UserCheckIcon from 'phosphor-svelte/lib/UserCheck';
  import ShieldWarningIcon from 'phosphor-svelte/lib/ShieldWarning';
  import EnvelopeIcon from 'phosphor-svelte/lib/EnvelopeSimple';
  import TrayIcon from 'phosphor-svelte/lib/Tray';
  import BugIcon from 'phosphor-svelte/lib/Bug';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRight';
  import ProhibitIcon from 'phosphor-svelte/lib/Prohibit';
  import WarningIcon from 'phosphor-svelte/lib/Warning';
  import HardDrivesIcon from 'phosphor-svelte/lib/HardDrives';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import LayoutIcon from 'phosphor-svelte/lib/Layout';
  import PaletteIcon from 'phosphor-svelte/lib/Palette';
  import GearIcon from 'phosphor-svelte/lib/GearSix';
  import ScrollIcon from 'phosphor-svelte/lib/Scroll';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import KpiCard from '$lib/components/admin/KpiCard.svelte';
  import ActivityChart from '$lib/components/admin/ActivityChart.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { auditLabel } from '$lib/audit-labels';
  import { formatNumber } from '$lib/format';
  import { can } from '$lib/viewer';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const d = $derived(data.dashboard);
  const v = $derived(data.viewer);

  function uptime(sec: number): string {
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    return days ? t('{days} gün {hours} sa', { days, hours }) : hours ? t('{hours} sa {mins} dk', { hours, mins }) : t('{mins} dk', { mins });
  }

  const todos = $derived(
    d
      ? [
          { label: t('Onay bekleyen üye'), count: d.stats.pendingApproval, href: '/admin/users?status=pending_approval', icon: UserCheckIcon, tone: 'var(--warning)' },
          { label: t('Onay bekleyen mesaj'), count: d.forum.pendingPosts, href: '/unread', icon: ShieldWarningIcon, tone: 'var(--warning)' },
          { label: t('Grup katılım isteği'), count: d.stats.pendingRequests, href: '/admin/group-requests', icon: TrayIcon, tone: 'var(--primary)' },
          { label: t('E-posta doğrulaması bekleyen'), count: d.stats.pendingEmail, href: '/admin/users?status=pending_email', icon: EnvelopeIcon, tone: 'var(--muted-foreground)' },
          { label: t('Başarısız arka plan işi'), count: d.stats.failedJobs, href: '/admin/jobs', icon: BugIcon, tone: 'var(--destructive)' },
        ]
      : [],
  );
  const openTodos = $derived(todos.filter((t) => t.count > 0));

  const quick = $derived(
    [
      { label: t('Bölüm ekle'), href: '/admin/forum/boards/new', icon: PlusIcon, show: can(v, 'admin.forum.manage') },
      { label: t('Ana sayfa düzeni'), href: '/admin/home', icon: LayoutIcon, show: can(v, 'admin.settings') },
      { label: t('Görünüm'), href: '/admin/appearance', icon: PaletteIcon, show: can(v, 'admin.settings') },
      { label: t('Ayarlar'), href: '/admin/settings/general', icon: GearIcon, show: can(v, 'admin.settings') },
    ].filter((q) => q.show),
  );
  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    return h < 6 ? t('İyi geceler') : h < 12 ? t('Günaydın') : h < 18 ? t('İyi günler') : t('İyi akşamlar');
  });
</script>

<PageHeader title={t('{greeting}, {name}', { greeting, name: v.user?.displayName ?? t('yönetici') })} description={t('Forumunun bugünkü durumu ve bekleyen işler.')} icon={SquaresIcon}>
  {#snippet actions()}
    {#each quick as q (q.href)}
      <Button variant="outline" href={q.href}><q.icon />{q.label}</Button>
    {/each}
  {/snippet}
</PageHeader>

{#if d}
  <div class="grid gap-6">
    <!-- Ana göstergeler -->
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard index={0} label={t('Mesajlar')} value={d.forum.posts} icon={ChatsIcon} series={d.posts.map((p) => p.count)} href="/admin/forum" />
      <KpiCard index={1} label={t('Konular')} value={d.forum.topics} icon={ChatTextIcon} series={d.topics.map((p) => p.count)} tone="oklch(0.7 0.14 250)" href="/admin/forum" />
      <KpiCard index={2} label={t('Etkin üyeler')} value={d.stats.total} icon={UserPlusIcon} series={d.registrations.map((p) => p.count)} tone="var(--success)" href="/admin/users" />
      <KpiCard
        index={3}
        label={t('Şu an çevrimiçi')}
        value={d.stats.online}
        icon={BroadcastIcon}
        tone="var(--warning)"
        hint={t('Son 24 saatte {posts} mesaj, {registrations} kayıt', { posts: formatNumber(d.forum.postsToday), registrations: formatNumber(d.stats.today) })}
      />
    </div>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <!-- Etkinlik grafiği -->
      <section class="rounded-2xl border bg-card p-5 shadow-card animate-rise">
        <header class="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 class="font-bold">{t('Etkinlik')}</h2>
            <p class="text-xs text-muted-foreground">{t('Son 14 günde günlük mesaj, konu ve kayıt sayıları')}</p>
          </div>
        </header>
        <ActivityChart
          series={[
            { label: t('Mesaj'), color: 'var(--primary)', points: d.posts },
            { label: t('Konu'), color: 'oklch(0.7 0.14 250)', points: d.topics },
            { label: t('Kayıt'), color: 'var(--success)', points: d.registrations },
          ]}
        />
      </section>

      <!-- Bekleyen işler -->
      <section class="flex flex-col rounded-2xl border bg-card shadow-card animate-rise" data-part="todos">
        <header class="flex items-center justify-between border-b px-5 py-4">
          <h2 class="font-bold">{t('Bekleyen işler')}</h2>
          {#if openTodos.length}<span class="rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-black">{openTodos.reduce((a, t) => a + t.count, 0)}</span>{/if}
        </header>
        {#if openTodos.length}
          <ul class="grid p-2">
            {#each openTodos as t (t.label)}
              <li>
                <a href={t.href} class="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent">
                  <span class="flex size-9 items-center justify-center rounded-xl" style="background:color-mix(in oklch, {t.tone} 16%, transparent);color:{t.tone}"><t.icon class="size-5" weight="duotone" /></span>
                  <span class="flex-1 text-sm font-medium">{t.label}</span>
                  <span class="text-lg font-extrabold tabular-nums">{formatNumber(t.count)}</span>
                  <CaretRightIcon class="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </a>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="grid flex-1 place-content-center justify-items-center gap-2 p-8 text-center">
            <span class="flex size-12 items-center justify-center rounded-2xl bg-success/15 text-success"><CheckCircleIcon class="size-7" weight="duotone" /></span>
            <p class="font-semibold">{t('Her şey yolunda')}</p>
            <p class="text-xs text-muted-foreground">{t('Onay ya da müdahale bekleyen bir şey yok.')}</p>
          </div>
        {/if}
        <div class="mt-auto grid grid-cols-2 gap-px border-t bg-border text-center text-xs">
          <a href="/admin/bans" class="flex items-center justify-center gap-1.5 bg-card px-3 py-3 hover:bg-accent"><ProhibitIcon class="size-4 text-destructive" /><b>{d.stats.activeBans}</b> {t('aktif yasak')}</a>
          <a href="/admin/warnings" class="flex items-center justify-center gap-1.5 bg-card px-3 py-3 hover:bg-accent"><WarningIcon class="size-4 text-warning" /><b>{d.stats.warnings7d}</b> {t('uyarı (7 gün)')}</a>
        </div>
      </section>
    </div>

    <div class="grid gap-6 xl:grid-cols-3">
      <!-- Son yönetim işlemleri -->
      <section class="rounded-2xl border bg-card shadow-card animate-rise xl:col-span-2">
        <header class="flex items-center justify-between border-b px-5 py-4">
          <h2 class="font-bold">{t('Son yönetim işlemleri')}</h2>
          {#if can(v, 'admin.logs.view')}<Button variant="ghost" size="sm" href="/admin/logs"><ScrollIcon />{t('Tüm kayıtlar')}</Button>{/if}
        </header>
        {#if d.recentActions.length}
          <ul class="divide-y">
            {#each d.recentActions as a (a.id)}
              <li class="flex items-center gap-3 px-5 py-3 text-sm">
                <UserAvatar user={a.actor ?? { displayName: t('Sistem'), avatarUrl: null }} size={32} />
                <p class="min-w-0 flex-1 truncate">
                  {#if a.actor}<UserName user={a.actor} class="font-semibold" />{:else}<b>{t('Sistem')}</b>{/if}
                  <span class="text-muted-foreground">{auditLabel(a.action)}</span>
                  {#if a.targetId}<span class="text-muted-foreground">(#{a.targetId})</span>{/if}
                </p>
                <span class={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', a.type === 'moderation' ? 'bg-warning/15 text-warning' : 'bg-primary-soft text-highlight')}>
                  {a.type === 'moderation' ? t('Moderasyon') : t('Yönetim')}
                </span>
                <TimeAgo ms={a.createdAt} class="w-24 shrink-0 text-right text-xs text-muted-foreground" />
              </li>
            {/each}
          </ul>
        {:else}
          <p class="px-5 py-8 text-center text-sm text-muted-foreground">{t('Henüz işlem kaydı yok.')}</p>
        {/if}
      </section>

      <div class="grid content-start gap-6">
        <!-- Son katılanlar -->
        <section class="rounded-2xl border bg-card shadow-card animate-rise">
          <header class="flex items-center justify-between border-b px-5 py-4">
            <h2 class="font-bold">{t('Son katılanlar')}</h2>
            <Button variant="ghost" size="sm" href="/admin/users">{t('Tümü')}</Button>
          </header>
          <ul class="grid p-2">
            {#each d.latestMembers.slice(0, 6) as u (u.id)}
              <li>
                <a href="/admin/users/{u.id}" class="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-accent">
                  <UserAvatar user={u} size={30} />
                  <span class="flex-1 truncate text-sm font-semibold" style={u.color ? `color:${u.color}` : undefined}>{u.displayName}</span>
                  <CaretRightIcon class="size-4 text-muted-foreground" />
                </a>
              </li>
            {/each}
          </ul>
        </section>

        <!-- Sistem -->
        <section class="rounded-2xl border bg-card p-5 shadow-card animate-rise">
          <h2 class="mb-3 flex items-center gap-2 font-bold"><HardDrivesIcon class="size-5 text-muted-foreground" weight="duotone" />{t('Sistem')}</h2>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <div><dt class="text-xs text-muted-foreground">{t('Veritabanı')}</dt><dd class="font-semibold">{d.system.db === 'sqlite' ? 'SQLite' : 'PostgreSQL'}</dd></div>
            <div><dt class="text-xs text-muted-foreground">Node.js</dt><dd class="font-semibold">{d.system.node}</dd></div>
            <div><dt class="text-xs text-muted-foreground">{t('Bellek')}</dt><dd class="font-semibold">{formatNumber(d.system.rssMb)} MB</dd></div>
            <div><dt class="text-xs text-muted-foreground">{t('Çalışma süresi')}</dt><dd class="font-semibold">{uptime(d.system.uptimeSec)}</dd></div>
            <div><dt class="text-xs text-muted-foreground">{t('E-posta')}</dt><dd class="font-semibold">{d.system.mailDriver}</dd></div>
            <div><dt class="text-xs text-muted-foreground">{t('Ortam')}</dt><dd class="font-semibold">{d.system.env}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  </div>
{/if}
