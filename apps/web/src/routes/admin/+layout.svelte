<script lang="ts">
  import WikiIcon from 'phosphor-svelte/lib/BookOpenText';
  import ShareIcon from 'phosphor-svelte/lib/ShareNetwork';
  import ApplicationsIcon from 'phosphor-svelte/lib/ClipboardText';
  import TicketsIcon from 'phosphor-svelte/lib/Lifebuoy';
  import PluginsIcon from 'phosphor-svelte/lib/PuzzlePiece';
  import ThemesIcon from 'phosphor-svelte/lib/PaintBrushBroad';
  import DiscordIcon from 'phosphor-svelte/lib/DiscordLogo';
  import FirewallIcon from 'phosphor-svelte/lib/ShieldCheckered';
  import UpdatesIcon from 'phosphor-svelte/lib/ArrowsClockwise';
  import { pluginEnabled } from '@forum/shared';
  import { page } from '$app/state';
  import LayoutDashboardIcon from 'phosphor-svelte/lib/SquaresFour';
  import SettingsIcon from 'phosphor-svelte/lib/Gear';
  import UsersIcon from 'phosphor-svelte/lib/Users';
  import UserCheckIcon from 'phosphor-svelte/lib/UserCheck';
  import ShieldIcon from 'phosphor-svelte/lib/Shield';
  import KeyRoundIcon from 'phosphor-svelte/lib/Key';
  import FileTextIcon from 'phosphor-svelte/lib/FileText';
  import ListChecksIcon from 'phosphor-svelte/lib/ListChecks';
  import BanIcon from 'phosphor-svelte/lib/Prohibit';
  import TriangleAlertIcon from 'phosphor-svelte/lib/Warning';
  import TrophyIcon from 'phosphor-svelte/lib/Trophy';
  import ScrollTextIcon from 'phosphor-svelte/lib/Scroll';
  import MailIcon from 'phosphor-svelte/lib/Envelope';
  import WrenchIcon from 'phosphor-svelte/lib/Wrench';
  import ImportIcon from 'phosphor-svelte/lib/ArrowSquareIn';
  import InboxIcon from 'phosphor-svelte/lib/Tray';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import MenuIcon from 'phosphor-svelte/lib/List';
  import MessagesSquareIcon from 'phosphor-svelte/lib/ChatsCircle';
  import LayersIcon from 'phosphor-svelte/lib/Stack';
  import PaletteIcon from 'phosphor-svelte/lib/Palette';
  import HomeLayoutIcon from 'phosphor-svelte/lib/Layout';
  import PagesIcon from 'phosphor-svelte/lib/Files';
  import HashIcon from 'phosphor-svelte/lib/Hash';
  import StickerIcon from 'phosphor-svelte/lib/Sticker';
  import PlugsIcon from 'phosphor-svelte/lib/PlugsConnected';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import ChevronDownIcon from 'phosphor-svelte/lib/CaretDown';
  import ChevronRightIcon from 'phosphor-svelte/lib/CaretRight';
  import ExternalLinkIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import { slide } from 'svelte/transition';
  import ThemeToggle from '$lib/components/layout/ThemeToggle.svelte';
  import CommandPalette, { type PaletteItem } from '$lib/components/admin/CommandPalette.svelte';
  import * as Sheet from '$lib/components/ui/sheet';
  import { buttonVariants } from '$lib/components/ui/button';
  import ElevationGate from '$lib/components/admin/ElevationGate.svelte';
  import AdminGuide from '$lib/components/admin/AdminGuide.svelte';
  import AdminHelpMenu from '$lib/components/admin/AdminHelpMenu.svelte';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import BrandMark from '$lib/components/layout/BrandMark.svelte';
  import { can } from '$lib/viewer';
  import { SETTING_SECTIONS, type IconNode } from '@forum/shared';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  let { data, children } = $props();
  const v = $derived(data.viewer);
  let mobileOpen = $state(false);

  type MenuIcon = typeof SettingsIcon | { nodes: IconNode | null };
  interface MenuItem {
    href: string;
    label: string;
    icon: MenuIcon;
    show: boolean;
    exact?: boolean;
    also?: string[];
    badge?: number;
    badgeText?: string | null;
    badgeTone?: 'danger';
    tour?: string;
    sub?: boolean;
  }
  const extMenu = $derived(data.access.extensions ?? []);
  const sections = $derived(
    (
      [
        {
          title: 'Genel',
          items: [
            { href: '/admin', label: t('Pano'), icon: LayoutDashboardIcon, show: true, exact: true },
            { href: '/admin/settings', label: t('Ayarlar'), icon: SettingsIcon, show: can(v, 'admin.settings') },
            { href: '/admin/developers', label: t('Geliştiriciler ve API'), icon: PlugsIcon, show: can(v, 'admin.developers') },
          ],
        },
        {
          title: 'Görünüm',
          items: [
            { href: '/admin/themes', label: t('Temalar'), icon: ThemesIcon, show: can(v, 'admin.settings') },
            { href: '/admin/appearance', label: t('Logo, menü ve alt bilgi'), icon: PaletteIcon, show: can(v, 'admin.settings') },
            { href: '/admin/home', label: t('Ana sayfa düzeni'), icon: HomeLayoutIcon, show: can(v, 'admin.settings') },
            { href: '/admin/pages', label: t('Sayfalar'), icon: PagesIcon, show: can(v, 'admin.pages.manage') },
            { href: '/admin/og-card', label: t('Paylaşım kartı'), icon: ShareIcon, show: can(v, 'admin.settings') },
          ],
        },
        {
          title: 'Forum',
          items: [
            { href: '/admin/forum', label: t('Bölümler ve önekler'), icon: MessagesSquareIcon, show: can(v, 'admin.forum.manage'), exact: true },
            { href: '/admin/forum/profiles', label: t('Bölüm yetki profilleri'), icon: LayersIcon, show: can(v, 'admin.permissions.manage') },
            { href: '/admin/tags', label: t('Etiketler'), icon: HashIcon, show: can(v, 'admin.forum.manage') },
            { href: '/admin/emojis', label: t('Emojiler ve tepkiler'), icon: StickerIcon, show: can(v, 'admin.forum.manage'), also: ['/admin/reactions'] },
            { href: '/admin/policies', label: t('Politikalar'), icon: FileTextIcon, show: can(v, 'admin.policies.manage') },
          ],
        },
        {
          title: 'Üyeler ve gruplar',
          items: [
            { href: '/admin/users', label: t('Üyeler'), icon: UsersIcon, show: can(v, 'admin.users.view') },
            { href: '/admin/users?status=pending_approval', label: t('Onay bekleyenler'), icon: UserCheckIcon, show: can(v, 'admin.users.approve'), badge: data.access.badges?.pendingUsers },
            { href: '/admin/groups', label: t('Gruplar'), icon: ShieldIcon, show: can(v, 'admin.groups.manage') },
            { href: '/admin/group-requests', label: t('Katılım istekleri'), icon: InboxIcon, show: can(v, 'admin.groups.manage'), badge: data.access.badges?.groupRequests },
            { href: '/admin/permissions', label: t('Yetkiler'), icon: KeyRoundIcon, show: can(v, 'admin.permissions.manage') },
            { href: '/admin/profile-fields', label: t('Profil alanları'), icon: ListChecksIcon, show: can(v, 'admin.profileFields.manage') },
          ],
        },
        {
          title: 'Moderasyon',
          items: [
            { href: '/admin/bans', label: t('Yasaklar'), icon: BanIcon, show: can(v, 'admin.bans.manage') },
            { href: '/admin/warnings', label: t('Uyarılar'), icon: TriangleAlertIcon, show: can(v, 'mod.warnings.view') || can(v, 'admin.warnings.manage') },
            { href: '/admin/achievements', label: t('Başarılar'), icon: TrophyIcon, show: can(v, 'admin.achievements.manage') },
          ],
        },
        {
          title: 'Eklentiler',
          items: [
            { href: '/admin/extensions', label: t('Eklenti yöneticisi'), icon: PluginsIcon, show: can(v, 'admin.settings'), exact: true, also: ['/admin/extensions/docs'], tour: 'nav-extensions' },
            { href: '/admin/wiki', label: t('Wiki'), icon: WikiIcon, show: can(v, 'admin.wiki') && pluginEnabled(v.settings, 'wiki') },
            { href: '/admin/applications', label: t('Başvuru formları'), icon: ApplicationsIcon, show: can(v, 'admin.applications') && pluginEnabled(v.settings, 'applications') },
            { href: '/admin/tickets', label: t('Destek kategorileri'), icon: TicketsIcon, show: can(v, 'admin.tickets') && pluginEnabled(v.settings, 'tickets') },
            { href: '/admin/discord', label: t('Discord'), icon: DiscordIcon, show: can(v, 'admin.settings') && pluginEnabled(v.settings, 'discord') },
            ...extMenu.flatMap((e) => [
              { href: `/admin/extensions/${e.id}`, label: e.name, icon: { nodes: e.iconNode }, show: true, exact: true },
              ...e.pages.map((pg) => ({ href: `/admin/extensions/${e.id}/${pg.key}`, label: pg.title, icon: { nodes: pg.iconNode }, show: true, sub: true })),
            ]),
          ],
        },
        {
          title: 'Sistem',
          items: [
            { href: '/admin/updates', label: t('Güncellemeler'), icon: UpdatesIcon, show: can(v, 'admin.maintenance'), badgeText: data.access.version?.available ? t('Yeni') : null },
            {
              href: '/admin/maintenance',
              label: t('Bakım ve yedekler'),
              icon: WrenchIcon,
              show: can(v, 'admin.maintenance'),
              also: ['/admin/jobs', '/admin/system'],
              badge: data.access.badges?.failedJobs,
              badgeTone: 'danger',
            },
            { href: '/admin/security', label: t('Güvenlik'), icon: FirewallIcon, show: can(v, 'admin.settings'), also: ['/admin/captcha'] },
            { href: '/admin/mail', label: t('E-posta'), icon: MailIcon, show: can(v, 'admin.settings') },
            { href: '/admin/logs', label: t('Kayıtlar'), icon: ScrollTextIcon, show: can(v, 'admin.logs.view') },
            { href: '/admin/import', label: t('Forum taşıma'), icon: ImportIcon, show: can(v, 'admin.maintenance') },
          ],
        },
      ] as Array<{ title: string; items: MenuItem[] }>
    )
      .map((s) => ({ ...s, items: s.items.filter((i) => i.show) }))
      .filter((s) => s.items.length),
  );

  const TAB_GROUPS = $derived(
    [
      [
        { href: '/admin/security', label: t('Güvenlik duvarı'), show: can(v, 'admin.settings') },
        { href: '/admin/captcha', label: t('Bot doğrulama (captcha)'), show: can(v, 'admin.settings') },
      ],
      [
        { href: '/admin/emojis', label: t('Özel emojiler'), show: can(v, 'admin.forum.manage') },
        { href: '/admin/reactions', label: t('Tepkiler'), show: can(v, 'admin.forum.manage') },
      ],
      [
        { href: '/admin/maintenance', label: t('Bakım ve yedekler'), show: can(v, 'admin.maintenance') },
        { href: '/admin/jobs', label: t('İşler ve görevler'), show: can(v, 'admin.maintenance') },
        { href: '/admin/system', label: t('Sistem bilgisi'), show: can(v, 'admin.maintenance') },
      ],
    ].map((g) => g.filter((x) => x.show)),
  );
  const tabs = $derived(TAB_GROUPS.find((g) => g.length > 1 && g.some((x) => page.url.pathname === x.href)) ?? null);

  function active(href: string, exact = false, also: string[] = []): boolean {
    if (also.some((x) => page.url.pathname === x || page.url.pathname.startsWith(`${x}/`))) return true;
    const [path, query] = href.split('?');
    if (query) return page.url.pathname === path && page.url.search === `?${query}`;
    if (exact) return page.url.pathname === path;
    return page.url.pathname === path || (page.url.pathname.startsWith(`${path}/`) && !page.url.search.includes('status='));
  }

  let filter = $state('');
  let collapsed = $state<string[]>([]);
  const COLLAPSE_KEY = 'forum:admin-collapsed';
  $effect(() => {
    try {
      collapsed = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]');
    } catch {
      collapsed = [];
    }
  });
  function toggleSection(title: string) {
    collapsed = collapsed.includes(title) ? collapsed.filter((t) => t !== title) : [...collapsed, title];
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
    } catch {
    }
  }
  const filtered = $derived.by(() => {
    const q = filter.trim().toLocaleLowerCase('tr-TR');
    if (!q) return sections;
    return sections
      .map((s) => ({ ...s, items: s.items.filter((i) => `${i.label} ${t(s.title)}`.toLocaleLowerCase('tr-TR').includes(q)) }))
      .filter((s) => s.items.length);
  });

  const current = $derived.by(() => {
    for (const s of sections) {
      const item = [...s.items].sort((a, b) => b.href.length - a.href.length).find((i) => active(i.href, i.exact, i.also));
      if (item) return { section: s.title, label: item.label };
    }
    return null;
  });

  const paletteItems = $derived<PaletteItem[]>([
    ...sections.flatMap((s) => s.items.filter((i) => typeof i.icon === 'function').map((i) => ({ label: i.label, href: i.href, group: t(s.title), icon: i.icon as typeof SettingsIcon }))),
    ...TAB_GROUPS.flat().map((x) => ({ label: x.label, href: x.href, group: t('Sayfalar'), icon: SettingsIcon })),
    ...Object.entries(SETTING_SECTIONS).map(([key, label]) => ({ label: t('Ayarlar: {label}', { label: t(label) }), href: `/admin/settings/${key}`, group: t('Ayarlar'), icon: SettingsIcon })),
    { label: t('Yeni bölüm oluştur'), href: '/admin/forum/boards/new', group: t('İşlemler'), icon: PlusIcon, keywords: t('forum kategori') },
    { label: t('Yeni grup oluştur'), href: '/admin/groups/new', group: t('İşlemler'), icon: PlusIcon, keywords: t('rütbe') },
    { label: t('Forumu görüntüle'), href: '/', group: t('İşlemler'), icon: ExternalLinkIcon },
  ]);
  let paletteOpen = $state(false);
  let guide = $state<ReturnType<typeof AdminGuide> | null>(null);
</script>

{#snippet nav()}
  <div class="relative mb-3">
    <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sidebar-foreground/50" />
    <input
      bind:value={filter}
      placeholder={t('Menüde ara…')}
      class="h-8 w-full rounded-lg border border-sidebar-border bg-background/60 pr-2 pl-8 text-sm outline-none focus:border-ring"
      aria-label={t('Yönetim menüsünde ara')}
    />
  </div>
  <nav class="grid gap-3" data-tour="nav">
    {#each filtered as s (s.title)}
      {@const isCollapsed = !filter && collapsed.includes(s.title)}
      <div class="grid gap-0.5" data-tour="group-{s.title}">
        <button
          type="button"
          onclick={() => toggleSection(s.title)}
          class="flex items-center justify-between rounded px-3 pb-1 text-[10.5px] font-bold tracking-[0.08em] text-sidebar-foreground/45 uppercase hover:text-sidebar-foreground"
          aria-expanded={!isCollapsed}
        >
          {t(s.title)}<ChevronDownIcon class={cn('size-3.5 transition-transform', isCollapsed && '-rotate-90')} />
        </button>
        {#if !isCollapsed}
          <div transition:slide={{ duration: 160 }} class="grid gap-0.5">
            {#each s.items as item (item.href)}
              {@const on = active(item.href, item.exact, item.also)}
              {@const badge = Number(item.badge ?? 0)}
              <a
                href={item.href}
                onclick={() => (mobileOpen = false)}
                aria-current={on ? 'page' : undefined}
                data-tour={item.tour}
                class={cn(
                  'group/item relative flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13.5px] font-medium transition-colors',
                  item.sub && 'py-[5px] pl-9 text-[12.5px]',
                  on ? 'bg-primary-soft text-highlight' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                )}
              >
                {#if on}<span class="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-primary"></span>{/if}
                {#if typeof item.icon === 'function'}
                  <item.icon class={cn('shrink-0', item.sub ? 'size-4' : 'size-[18px]')} weight={on ? 'fill' : 'regular'} />
                {:else}
                  <NodeIcon nodes={item.icon.nodes} size={item.sub ? 16 : 18} />
                {/if}
                <span class="truncate">{item.label}</span>
                {#if item.badgeText}
                  <span class="ml-auto rounded-full bg-success px-1.5 py-px text-[10px] font-bold text-white">{item.badgeText}</span>
                {/if}
                {#if badge > 0}
                  <span
                    class={cn(
                      'ml-auto rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums',
                      item.badgeTone === 'danger' ? 'bg-destructive text-white' : 'bg-warning text-black',
                    )}>{badge > 99 ? '99+' : badge}</span
                  >
                {/if}
              </a>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <p class="px-3 text-sm text-sidebar-foreground/60">{t('Eşleşen sayfa yok.')}</p>
    {/each}
  </nav>
{/snippet}

<svelte:head><title>{t('Yönetim paneli')}</title></svelte:head>

<div class="flex min-h-dvh bg-background">
  <aside class="sticky top-0 hidden h-dvh w-[17rem] shrink-0 flex-col border-r bg-sidebar md:flex">
    <div class="flex h-16 items-center gap-2.5 px-4">
      <a href="/admin" class="flex min-w-0 items-center gap-2.5">
        <BrandMark size={32} withName={false} />
        <span class="min-w-0">
          <span class="block truncate text-sm font-extrabold">{v.settings['general.forumName']}</span>
          <span class="block text-[11px] font-medium text-sidebar-foreground/55">{t('Yönetim paneli')}</span>
        </span>
      </a>
    </div>
    <div class="flex-1 overflow-y-auto px-3 pb-3">
      {@render nav()}
      {#if data.access.version}
        <a href="/admin/updates" class="mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground" data-part="product-version" data-tour="version">
          <img src="/brand/inkforum-icon-192.png" alt="" class="size-4 rounded" />
          InkForum v{data.access.version.current}
          {#if data.access.version.available}<span class="ml-auto font-semibold text-success">{t('v{version} hazır', { version: data.access.version.available })}</span>{/if}
        </a>
      {/if}
    </div>
    {#if v.user}
      <div class="flex items-center gap-2.5 border-t p-3">
        <UserAvatar user={v.user} size={34} />
        <span class="grid min-w-0 flex-1 leading-tight">
          <span class="truncate text-sm font-semibold">{v.user.displayName}</span>
          <span class="truncate text-[11px] text-sidebar-foreground/55">{v.user.primaryGroup ? tc(v.user.primaryGroup.name) : t('Yönetici')}</span>
        </span>
        <a href="/" class={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }))} title={t('Foruma dön')} aria-label={t('Foruma dön')}><ArrowLeftIcon /></a>
      </div>
    {/if}
  </aside>

  <div class="flex min-w-0 flex-1 flex-col">
    <header class="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-xl md:px-8">
      <Sheet.Root bind:open={mobileOpen}>
        <Sheet.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'md:hidden')} aria-label={t('Menü')}><MenuIcon /></Sheet.Trigger>
        <Sheet.Content side="left" class="w-72 overflow-y-auto bg-sidebar p-3">
          <Sheet.Header><Sheet.Title>{t('Yönetim paneli')}</Sheet.Title></Sheet.Header>
          {@render nav()}
        </Sheet.Content>
      </Sheet.Root>
      <nav class="flex min-w-0 items-center gap-1.5 text-sm" aria-label={t('Konum')}>
        <a href="/admin" class="text-muted-foreground hover:text-foreground">{t('Yönetim')}</a>
        {#if current}
          <ChevronRightIcon class="size-3.5 text-muted-foreground" />
          <span class="hidden text-muted-foreground sm:inline">{t(current.section)}</span>
          <ChevronRightIcon class="hidden size-3.5 text-muted-foreground sm:inline" />
          <span class="truncate font-medium">{current.label}</span>
        {/if}
      </nav>
      <button
        type="button"
        onclick={() => (paletteOpen = true)}
        data-tour="palette"
        class="ml-auto hidden h-10 w-72 items-center gap-2 rounded-xl border bg-card/60 px-3 text-sm text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground sm:flex"
      >
        <SearchIcon class="size-3.5" />{t('Hızlı erişim…')}<kbd class="ml-auto rounded border bg-background px-1.5 text-[10px]">Ctrl K</kbd>
      </button>
      <button type="button" onclick={() => (paletteOpen = true)} class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'ml-auto sm:hidden')} aria-label={t('Hızlı erişim')}><SearchIcon /></button>
      <AdminHelpMenu onTour={() => guide?.startTour()} onNews={() => guide?.showNews(true)} />
      <ThemeToggle loggedIn={!!v.user} timezone={v.user?.timezone ?? 'Europe/Istanbul'} />
      <a href="/" class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))} title={t('Forumu görüntüle')} aria-label={t('Forumu görüntüle')}><ExternalLinkIcon /></a>
    </header>
    <main class="mx-auto w-full max-w-[90rem] flex-1 px-4 py-7 md:px-8" style="view-transition-name: page">
      {#if !data.access.elevated}
        <ElevationGate twoFactor={!!v.user?.twoFactorEnabled} />
      {:else}
        {#if tabs}
          <nav class="-mt-2 mb-6 flex gap-1 overflow-x-auto border-b scrollbar-none" aria-label={t('Bölüm sekmeleri')} data-part="admin-tabs">
            {#each tabs as tab (tab.href)}
              {@const on = page.url.pathname === tab.href}
              <a
                href={tab.href}
                aria-current={on ? 'page' : undefined}
                class={cn('-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition-colors', on ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
                >{tab.label}</a
              >
            {/each}
          </nav>
        {/if}
        {@render children()}
      {/if}
    </main>
  </div>
</div>

<CommandPalette items={paletteItems} bind:open={paletteOpen} />
{#if data.access.elevated && data.access.onboarding}
  <AdminGuide bind:this={guide} onboarding={data.access.onboarding} />
{/if}
