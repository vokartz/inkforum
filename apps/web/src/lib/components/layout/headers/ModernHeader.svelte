<script lang="ts">
  import type { NavEntry, Viewer } from '@forum/shared';
  import { page } from '$app/state';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import SignInIcon from 'phosphor-svelte/lib/SignIn';
  import UserPlusIcon from 'phosphor-svelte/lib/UserPlus';
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
  import SiteBanner from '../SiteBanner.svelte';
  import { themeOptions } from '$lib/theme-options';

  let { viewer, nav, onsearch }: { viewer: Viewer; nav: NavEntry[]; onsearch: () => void } = $props();
  let scrolled = $state(false);

  const s = $derived(viewer.settings);
  const forumName = $derived(String(s['general.forumName'] ?? 'Forum'));
  const banner = $derived(s['appearance.bannerEnabled'] !== false);
  const opts = $derived(themeOptions(s));
  const sticky = $derived(opts?.header.sticky ?? true);
  const height = $derived({ compact: 'h-14', normal: 'h-16', tall: 'h-20' }[opts?.header.height ?? 'normal']);
  const navVariant = $derived(opts?.header.nav ?? 'pill');
  const newTopicHref = $derived.by(() => {
    const m = /^\/f\/(\d+)/.exec(page.url.pathname);
    return m ? `/f/${m[1]}/new` : '/new';
  });
</script>

<svelte:window onscroll={() => (scrolled = window.scrollY > 4)} />

{#if banner}<SiteBanner />{/if}

<header
  data-part="topbar"
  class={cn('z-40 border-b bg-topbar transition-shadow duration-300', sticky && 'sticky top-0', (opts?.header.blur ?? true) && 'backdrop-blur-xl', scrolled && 'shadow-sm')}
>
  <div class="mx-auto flex {height} w-full max-w-[var(--page-width,80rem)] items-center gap-1.5 px-3 sm:gap-2 sm:px-6">
    <MobileNav {nav} />
    <!-- Banner kapalıysa ya da sayfa kaydırıldıysa logo üst çubukta -->
    {#if !banner}
      <a href="/" class="mr-3 flex min-w-0 shrink-0 items-center" aria-label={t('{name} ana sayfa', { name: forumName })}><BrandMark size={32} /></a>
    {:else if scrolled}
      <a href="/" class="mr-3 hidden min-w-0 shrink-0 items-center animate-in fade-in md:flex" aria-label={t('{name} ana sayfa', { name: forumName })}><BrandMark size={28} withName={false} /></a>
    {/if}
    <div class="hidden min-w-0 flex-1 md:flex"><MainNav items={nav} variant={navVariant} /></div>
    <div class="flex-1 md:hidden"></div>

    <button
      type="button"
      onclick={onsearch}
      class="hidden h-9 w-52 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:text-foreground lg:flex xl:w-64"
      data-part="search-trigger"
    >
      <SearchIcon class="size-4" />
      <span class="flex-1 text-left">{t('Ara…')}</span>
      <kbd class="rounded border bg-muted px-1.5 font-sans text-[10px] font-semibold">Ctrl K</kbd>
    </button>
    <button type="button" onclick={onsearch} class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'lg:hidden')} aria-label={t('Ara')}><SearchIcon class="size-5" /></button>

    {#if viewer.user}
      <a href={newTopicHref} class={cn(buttonVariants(), 'hidden sm:inline-flex')} data-part="new-topic"><PlusIcon weight="bold" />{t('Yeni konu')}</a>
      <MessagesButton />
      <NotificationBell unread={viewer.user.unreadNotifications} />
      <UserMenu {viewer} class="ml-0.5" />
    {:else}
      <ThemeToggle loggedIn={false} timezone="Europe/Istanbul" class="hidden sm:inline-flex" />
      <a href={loginHref()} class={buttonVariants({ variant: 'ghost' })}><SignInIcon />{t('Giriş yap')}</a>
      {#if s['registration.mode'] !== 'closed'}<a href="/register" class={cn(buttonVariants(), 'hidden sm:inline-flex')}><UserPlusIcon />{t('Kayıt ol')}</a>{/if}
    {/if}
  </div>
</header>
