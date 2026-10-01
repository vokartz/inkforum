<script lang="ts">
  import type { NavEntry, Viewer } from '@forum/shared';
  import { page } from '$app/state';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import SignInIcon from 'phosphor-svelte/lib/SignIn';
  import UserPlusIcon from 'phosphor-svelte/lib/UserPlus';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import BookmarkIcon from 'phosphor-svelte/lib/BookmarkSimple';
  import { buttonVariants } from '$lib/components/ui/button';
  import { loginHref } from '$lib/nav-auth';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import ThemeToggle from '../ThemeToggle.svelte';
  import NotificationBell from '../NotificationBell.svelte';
  import MessagesButton from '../MessagesButton.svelte';
  import MainNav from '../MainNav.svelte';
  import BrandMark from '../BrandMark.svelte';
  import UserMenu from '../UserMenu.svelte';
  import MobileNav from '../MobileNav.svelte';

  /**
   * Nova: kurumsal forum düzeni. Vurgu renkli koyu bantta logo, arama ve hesap; altında sekme menü.
   * Etkin sekme, açık renkli alt menü şeridiyle birleşir (şeritte o bölümün kısa yolları).
   */
  let { viewer, nav, onsearch }: { viewer: Viewer; nav: NavEntry[]; onsearch: () => void } = $props();

  const s = $derived(viewer.settings);
  const forumName = $derived(String(s['general.forumName'] ?? 'Forum'));
  const image = $derived(
    s['appearance.bannerEnabled'] !== false ? (s['appearance.bannerUrl'] as string | null | undefined) : null,
  );
  const height = $derived(Math.max(72, Math.min(200, Number(s['appearance.bannerHeight'] ?? 160) * 0.6)));
  const path = $derived(page.url.pathname);
  // Etkin açılır menünün alt öğeleri alt şeritte gösterilir
  const activeChildren = $derived(
    nav.find(
      (e) => !e.href && e.children.some((c) => c.href && (path === c.href || path.startsWith(`${c.href}/`))),
    )?.children ?? [],
  );
  const newTopicHref = $derived.by(() => {
    const m = /^\/f\/(\d+)/.exec(path);
    return m ? `/f/${m[1]}/new` : '/new';
  });
  const subLink =
    'inline-flex h-full items-center gap-1.5 px-2.5 text-[13px] font-medium text-topbar-foreground/80 transition-colors hover:text-[var(--nav-active)]';
</script>

<header data-part="site-header" class="relative isolate bg-header text-header-foreground">
  {#if image}
    <div class="absolute inset-0 -z-10 bg-cover bg-center" style="background-image:url('{image}')"></div>
    <div class="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 to-[var(--header-bg)]"></div>
  {/if}
  <div class="mx-auto flex w-full max-w-7xl items-center gap-3 px-3 sm:px-6" style="min-height:{height}px">
    <MobileNav {nav} />
    <a href="/" class="min-w-0" aria-label={t('{name} ana sayfa', { name: forumName })}
      ><BrandMark size={40} surface="dark" nameClass="text-white" /></a
    >
    <span class="flex-1"></span>
    <button
      type="button"
      onclick={onsearch}
      class="hidden h-9 w-60 items-center gap-2 rounded-[var(--radius)] border border-white/15 bg-white/10 px-3 text-sm text-white/75 transition-colors hover:bg-white/15 hover:text-white md:flex"
      data-part="search-trigger"
    >
      <SearchIcon class="size-4" /><span class="flex-1 text-left">{t('Ara…')}</span><kbd
        class="rounded bg-white/15 px-1.5 font-sans text-[10px] font-semibold">Ctrl K</kbd
      >
    </button>
    <button
      type="button"
      onclick={onsearch}
      class={cn(
        buttonVariants({ variant: 'ghost', size: 'icon' }),
        'text-white hover:bg-white/10 hover:text-white md:hidden',
      )}
      aria-label={t('Ara')}><SearchIcon class="size-5" /></button
    >
  </div>

  <!-- Sekme menü ve hesap -->
  <div class="mx-auto flex w-full max-w-7xl items-end gap-2 px-3 sm:px-6">
    <div class="hidden min-w-0 flex-1 md:flex"><MainNav items={nav} variant="nova" /></div>
    <div class="flex-1 md:hidden"></div>
    <div class="flex items-center gap-0.5 pb-1">
      {#if viewer.user}
        <MessagesButton class="text-white hover:bg-white/10 hover:text-white" />
        <NotificationBell
          unread={viewer.user.unreadNotifications}
          class="text-white hover:bg-white/10 hover:text-white"
        />
        <UserMenu {viewer} variant="named" class="text-white" />
      {:else}
        <ThemeToggle
          loggedIn={false}
          timezone="Europe/Istanbul"
          class="hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex"
        />
        <a
          href={loginHref()}
          class="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          ><SignInIcon class="size-4" />{t('Giriş yap')}</a
        >
        {#if s['registration.mode'] !== 'closed'}<a
            href="/register"
            class="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            ><UserPlusIcon class="size-4" />{t('Kayıt ol')}</a
          >{/if}
      {/if}
    </div>
  </div>
</header>

<!-- Alt menü şeridi -->
<nav
  data-part="site-nav"
  class="sticky top-0 z-40 border-b bg-topbar text-topbar-foreground shadow-sm"
  aria-label={t('Kısa yollar')}
>
  <div class="mx-auto flex h-10 w-full max-w-7xl items-center gap-1 overflow-x-auto px-1.5 sm:px-4">
    {#if activeChildren.length}
      {#each activeChildren as c (c.id)}
        <a
          href={c.href}
          target={c.newTab ? '_blank' : undefined}
          class={cn(
            subLink,
            c.href &&
              (path === c.href || path.startsWith(`${c.href}/`)) &&
              'font-semibold text-[var(--nav-active)]',
          )}>{c.label}</a
        >
      {/each}
    {:else}
      <a href="/unread" class={subLink}><BookmarkIcon class="size-4" />{t('Okunmamış içerik')}</a>
      <a href="/search" class={subLink}><SearchIcon class="size-4" />{t('Gelişmiş arama')}</a>
    {/if}
    <span class="flex-1"></span>
    {#if viewer.user}
      <a
        href={newTopicHref}
        class={cn(buttonVariants({ size: 'sm' }), 'h-7 shrink-0 px-3 text-xs')}
        data-part="new-topic"><PlusIcon weight="bold" />{t('Yeni konu')}</a
      >
    {/if}
  </div>
</nav>
