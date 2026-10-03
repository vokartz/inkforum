<script lang="ts">
  import type { NavEntry, Viewer } from '@forum/shared';
  import { page } from '$app/state';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import SignInIcon from 'phosphor-svelte/lib/SignIn';
  import { buttonVariants } from '$lib/components/ui/button';
  import { loginHref } from '$lib/nav-auth';
  import { themeOptions } from '$lib/theme-options';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import ThemeToggle from '../ThemeToggle.svelte';
  import NotificationBell from '../NotificationBell.svelte';
  import MessagesButton from '../MessagesButton.svelte';
  import MainNav from '../MainNav.svelte';
  import BrandMark from '../BrandMark.svelte';
  import UserMenu from '../UserMenu.svelte';
  import MobileNav from '../MobileNav.svelte';
  import SiteBanner from '../SiteBanner.svelte';

  let { viewer, nav, onsearch }: { viewer: Viewer; nav: NavEntry[]; onsearch: () => void } = $props();

  const s = $derived(viewer.settings);
  const opts = $derived(themeOptions(s));
  const forumName = $derived(String(s['general.forumName'] ?? 'Forum'));
  const banner = $derived(s['appearance.bannerEnabled'] !== false);
  const tagline = $derived(String(s['appearance.bannerTagline'] ?? '').trim());
  const pad = $derived({ compact: 'py-6', normal: 'py-9', tall: 'py-14' }[opts?.header.height ?? 'normal']);
  const newTopicHref = $derived.by(() => {
    const m = /^\/f\/(\d+)/.exec(page.url.pathname);
    return m ? `/f/${m[1]}/new` : '/new';
  });
</script>

<header data-part="site-header" class="bg-header text-header-foreground">
  {#if banner}
    <SiteBanner center />
  {:else}
    <div
      class={cn(
        'mx-auto grid w-full max-w-[var(--page-width,80rem)] justify-items-center gap-2 px-4 text-center',
        pad,
      )}
    >
      <a href="/" class="min-w-0" aria-label={t('{name} ana sayfa', { name: forumName })}
        ><BrandMark size={52} class="justify-center" /></a
      >
      {#if tagline}<p class="max-w-2xl text-sm opacity-75" data-part="banner-tagline">{tagline}</p>{/if}
    </div>
  {/if}
</header>

<nav
  data-part="site-nav"
  class={cn(
    'z-40 border-y bg-topbar text-topbar-foreground',
    opts?.header.sticky !== false && 'sticky top-0',
    opts?.header.blur !== false && 'backdrop-blur-xl',
  )}
  aria-label={t('Site menüsü')}
>
  <div class="mx-auto flex h-14 w-full max-w-[var(--page-width,80rem)] items-center gap-2 px-3 sm:px-6">
    <MobileNav {nav} />
    <span class="hidden flex-1 md:block"></span>
    <div class="hidden min-w-0 justify-center md:flex">
      <MainNav items={nav} variant={opts?.header.nav ?? 'underline'} />
    </div>
    <span class="flex-1"></span>
    <button
      type="button"
      onclick={onsearch}
      class={buttonVariants({ variant: 'ghost', size: 'icon' })}
      aria-label={t('Ara')}
      data-part="search-trigger"><SearchIcon class="size-5" /></button
    >
    {#if viewer.user}
      <a
        href={newTopicHref}
        class={cn(buttonVariants({ size: 'sm' }), 'hidden lg:inline-flex')}
        data-part="new-topic"><PlusIcon weight="bold" />{t('Yeni konu')}</a
      >
      <MessagesButton />
      <NotificationBell unread={viewer.user.unreadNotifications} />
      <UserMenu {viewer} />
    {:else}
      <ThemeToggle loggedIn={false} timezone="Europe/Istanbul" class="hidden sm:inline-flex" />
      <a href={loginHref()} class={buttonVariants({ variant: 'ghost', size: 'sm' })}
        ><SignInIcon />{t('Giriş yap')}</a
      >
    {/if}
  </div>
</nav>
