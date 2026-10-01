<script lang="ts">
  import WikiIcon from 'phosphor-svelte/lib/BookOpenText';
  import RobotIcon from 'phosphor-svelte/lib/Robot';
  import ApplicationsIcon from 'phosphor-svelte/lib/ClipboardText';
  import TicketsIcon from 'phosphor-svelte/lib/Lifebuoy';
  import PluginsIcon from 'phosphor-svelte/lib/PuzzlePiece';
  import ThemesIcon from 'phosphor-svelte/lib/PaintBrushBroad';
  import ShoutboxIcon from 'phosphor-svelte/lib/ChatCenteredDots';
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
  import CogIcon from 'phosphor-svelte/lib/Gear';
  import MailIcon from 'phosphor-svelte/lib/Envelope';
  import WrenchIcon from 'phosphor-svelte/lib/Wrench';
  import ServerIcon from 'phosphor-svelte/lib/HardDrives';
  import ImportIcon from 'phosphor-svelte/lib/ArrowSquareIn';
  import InboxIcon from 'phosphor-svelte/lib/Tray';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import MenuIcon from 'phosphor-svelte/lib/List';
  import MessagesSquareIcon from 'phosphor-svelte/lib/ChatsCircle';
  import LayersIcon from 'phosphor-svelte/lib/Stack';
  import SquarePlayIcon from 'phosphor-svelte/lib/YoutubeLogo';
  import PaletteIcon from 'phosphor-svelte/lib/Palette';
  import SmileyIcon from 'phosphor-svelte/lib/Smiley';
  import HomeLayoutIcon from 'phosphor-svelte/lib/Layout';
  import PagesIcon from 'phosphor-svelte/lib/Files';
  import HashIcon from 'phosphor-svelte/lib/Hash';
  import StickerIcon from 'phosphor-svelte/lib/Sticker';
  import CodeBlockIcon from 'phosphor-svelte/lib/CodeBlock';
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
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import BrandMark from '$lib/components/layout/BrandMark.svelte';
  import { can } from '$lib/viewer';
  import { SETTING_SECTIONS } from '@forum/shared';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  let { data, children } = $props();
  const v = $derived(data.viewer);
  let mobileOpen = $state(false);

  const sections = $derived(
    [
      {
        title: 'Genel',
        items: [
          { href: '/admin', label: t('Pano'), icon: LayoutDashboardIcon, show: true, exact: true },
          { href: '/admin/settings', label: t('Ayarlar'), icon: SettingsIcon, show: can(v, 'admin.settings') },
          { href: '/admin/themes', label: t('Temalar'), icon: ThemesIcon, show: can(v, 'admin.settings') },
          { href: '/admin/appearance', label: t('Görünüm'), icon: PaletteIcon, show: can(v, 'admin.settings') },
          { href: '/admin/home', label: t('Ana sayfa düzeni'), icon: HomeLayoutIcon, show: can(v, 'admin.settings') },
          { href: '/admin/plugins', label: t('Eklentiler'), icon: PluginsIcon, show: can(v, 'admin.settings') },
          { href: '/admin/pages', label: t('Sayfalar'), icon: PagesIcon, show: can(v, 'admin.pages.manage') },
          { href: '/admin/wiki', label: t('Wiki'), icon: WikiIcon, show: can(v, 'admin.wiki') && pluginEnabled(v.settings, 'wiki') },
          { href: '/admin/applications', label: t('Başvuru formları'), icon: ApplicationsIcon, show: can(v, 'admin.applications') && pluginEnabled(v.settings, 'applications') },
          { href: '/admin/tickets', label: t('Destek kategorileri'), icon: TicketsIcon, show: can(v, 'admin.tickets') && pluginEnabled(v.settings, 'tickets') },
          { href: '/admin/shoutbox', label: t('Sohbet kutusu'), icon: ShoutboxIcon, show: can(v, 'admin.settings') && pluginEnabled(v.settings, 'shoutbox') },
          { href: '/admin/discord', label: t('Discord'), icon: DiscordIcon, show: can(v, 'admin.settings') && pluginEnabled(v.settings, 'discord') },
          { href: '/admin/custom', label: t('Özel kod ve entegrasyon'), icon: CodeBlockIcon, show: can(v, 'admin.customCode') },
          { href: '/admin/developers', label: t('Geliştiriciler ve API'), icon: PlugsIcon, show: can(v, 'admin.developers') },
        ],
      },
      {
        title: 'Forum',
        items: [
          { href: '/admin/forum', label: t('Bölümler ve önekler'), icon: MessagesSquareIcon, show: can(v, 'admin.forum.manage'), exact: true },
          { href: '/admin/forum/profiles', label: t('Bölüm yetki profilleri'), icon: LayersIcon, show: can(v, 'admin.permissions.manage') },
          { href: '/admin/tags', label: t('Etiketler'), icon: HashIcon, show: can(v, 'admin.forum.manage') },
          { href: '/admin/emojis', label: t('Özel emojiler'), icon: StickerIcon, show: can(v, 'admin.forum.manage') },
          { href: '/admin/reactions', label: t('Tepkiler'), icon: SmileyIcon, show: can(v, 'admin.forum.manage') },
          { href: '/admin/embeds', label: t('Gömülü içerik'), icon: SquarePlayIcon, show: can(v, 'admin.settings') },
        ],
      },
      {
        title: 'Üyeler',
        items: [
          { href: '/admin/users', label: t('Üyeler'), icon: UsersIcon, show: can(v, 'admin.users.view') },
          { href: '/admin/users?status=pending_approval', label: t('Onay bekleyenler'), icon: UserCheckIcon, show: can(v, 'admin.users.approve'), badge: data.access.badges?.pendingUsers },
          { href: '/admin/profile-fields', label: t('Profil alanları'), icon: ListChecksIcon, show: can(v, 'admin.profileFields.manage') },
        ],
      },
      {
        title: 'Gruplar ve yetkiler',
        items: [
          { href: '/admin/groups', label: t('Gruplar'), icon: ShieldIcon, show: can(v, 'admin.groups.manage') },
          { href: '/admin/group-requests', label: t('Katılım istekleri'), icon: InboxIcon, show: can(v, 'admin.groups.manage'), badge: data.access.badges?.groupRequests },
          { href: '/admin/permissions', label: t('Yetkiler'), icon: KeyRoundIcon, show: can(v, 'admin.permissions.manage') },
        ],
      },
      {
        title: 'İçerik',
        items: [{ href: '/admin/policies', label: t('Politikalar'), icon: FileTextIcon, show: can(v, 'admin.policies.manage') }],
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
        title: 'Sistem',
        items: [
          { href: '/admin/logs', label: t('Kayıtlar'), icon: ScrollTextIcon, show: can(v, 'admin.logs.view') },
          { href: '/admin/jobs', label: t('İşler ve görevler'), icon: CogIcon, show: can(v, 'admin.maintenance'), badge: data.access.badges?.failedJobs, badgeTone: 'danger' },
          { href: '/admin/mail', label: t('E-posta'), icon: MailIcon, show: can(v, 'admin.settings') },
          { href: '/admin/security', label: t('Güvenlik duvarı'), icon: FirewallIcon, show: can(v, 'admin.settings') },
          { href: '/admin/captcha', label: t('Captcha'), icon: RobotIcon, show: can(v, 'admin.settings') },
          { href: '/admin/updates', label: t('Güncellemeler'), icon: UpdatesIcon, show: can(v, 'admin.maintenance'), badgeText: data.access.version?.available ? t('Yeni') : null },
          { href: '/admin/maintenance', label: t('Bakım ve yedekler'), icon: WrenchIcon, show: can(v, 'admin.maintenance') },
          { href: '/admin/import', label: t('Forum taşıma'), icon: ImportIcon, show: can(v, 'admin.maintenance') },
          { href: '/admin/system', label: t('Sistem bilgisi'), icon: ServerIcon, show: can(v, 'admin.maintenance') },
        ],
      },
    ]
      .map((s) => ({ ...s, items: s.items.filter((i) => i.show) }))
      .filter((s) => s.items.length),
  );

  function active(href: string, exact = false): boolean {
    const [path, query] = href.split('?');
    if (query) return page.url.pathname === path && page.url.search === `?${query}`;
    if (exact) return page.url.pathname === path;
    return page.url.pathname === path || (page.url.pathname.startsWith(`${path}/`) && !page.url.search.includes('status='));
  }

  // ----- Menü arama ve daraltma -----
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
      /* yoksay */
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
      const item = [...s.items].sort((a, b) => b.href.length - a.href.length).find((i) => active(i.href, 'exact' in i && i.exact));
      if (item) return { section: s.title, label: item.label };
    }
    return null;
  });

  const paletteItems = $derived<PaletteItem[]>([
    ...sections.flatMap((s) => s.items.map((i) => ({ label: i.label, href: i.href, group: t(s.title), icon: i.icon }))),
    ...Object.entries(SETTING_SECTIONS).map(([key, label]) => ({ label: t('Ayarlar: {label}', { label: t(label) }), href: `/admin/settings/${key}`, group: t('Ayarlar'), icon: SettingsIcon })),
    { label: t('Yeni bölüm oluştur'), href: '/admin/forum/boards/new', group: t('İşlemler'), icon: PlusIcon, keywords: t('forum kategori') },
    { label: t('Yeni grup oluştur'), href: '/admin/groups/new', group: t('İşlemler'), icon: PlusIcon, keywords: t('rütbe') },
    { label: t('Forumu görüntüle'), href: '/', group: t('İşlemler'), icon: ExternalLinkIcon },
  ]);
  let paletteOpen = $state(false);
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
  <nav class="grid gap-3">
    {#each filtered as s (s.title)}
      {@const isCollapsed = !filter && collapsed.includes(s.title)}
      <div class="grid gap-0.5">
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
              {@const on = active(item.href, 'exact' in item && item.exact)}
              {@const badge = 'badge' in item ? Number(item.badge ?? 0) : 0}
              <a
                href={item.href}
                onclick={() => (mobileOpen = false)}
                aria-current={on ? 'page' : undefined}
                class={cn(
                  'group/item relative flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13.5px] font-medium transition-colors',
                  on ? 'bg-primary-soft text-highlight' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                )}
              >
                {#if on}<span class="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-primary"></span>{/if}
                <item.icon class="size-[18px] shrink-0" weight={on ? 'fill' : 'regular'} />
                <span class="truncate">{item.label}</span>
                {#if 'badgeText' in item && item.badgeText}
                  <span class="ml-auto rounded-full bg-success px-1.5 py-px text-[10px] font-bold text-white">{item.badgeText}</span>
                {/if}
                {#if badge > 0}
                  <span
                    class={cn(
                      'ml-auto rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums',
                      'badgeTone' in item && item.badgeTone === 'danger' ? 'bg-destructive text-white' : 'bg-warning text-black',
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
        <a href="/admin/updates" class="mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground" data-part="product-version">
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
        class="ml-auto hidden h-10 w-72 items-center gap-2 rounded-xl border bg-card/60 px-3 text-sm text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground sm:flex"
      >
        <SearchIcon class="size-3.5" />{t('Hızlı erişim…')}<kbd class="ml-auto rounded border bg-background px-1.5 text-[10px]">Ctrl K</kbd>
      </button>
      <button type="button" onclick={() => (paletteOpen = true)} class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'ml-auto sm:hidden')} aria-label={t('Hızlı erişim')}><SearchIcon /></button>
      <ThemeToggle loggedIn={!!v.user} timezone={v.user?.timezone ?? 'Europe/Istanbul'} />
      <a href="/" class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))} title={t('Forumu görüntüle')} aria-label={t('Forumu görüntüle')}><ExternalLinkIcon /></a>
    </header>
    <main class="mx-auto w-full max-w-[90rem] flex-1 px-4 py-7 md:px-8" style="view-transition-name: page">
      {#if !data.access.elevated}
        <ElevationGate twoFactor={!!v.user?.twoFactorEnabled} />
      {:else}
        {@render children()}
      {/if}
    </main>
  </div>
</div>

<CommandPalette items={paletteItems} bind:open={paletteOpen} />
