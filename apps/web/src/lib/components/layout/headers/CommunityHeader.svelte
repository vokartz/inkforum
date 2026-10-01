<script lang="ts">
  import type { NavEntry, Viewer } from '@forum/shared';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import SignInIcon from 'phosphor-svelte/lib/SignIn';
  import UserPlusIcon from 'phosphor-svelte/lib/UserPlus';
  import { buttonVariants } from '$lib/components/ui/button';
  import { loginHref } from '$lib/nav-auth';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import NotificationBell from '../NotificationBell.svelte';
  import MessagesButton from '../MessagesButton.svelte';
  import MainNav from '../MainNav.svelte';
  import BrandMark from '../BrandMark.svelte';
  import UserMenu from '../UserMenu.svelte';
  import MobileNav from '../MobileNav.svelte';
  import CreateMenu from '../CreateMenu.svelte';
  import SiteBanner from '../SiteBanner.svelte';

  let { viewer, nav, onsearch }: { viewer: Viewer; nav: NavEntry[]; onsearch: () => void } = $props();

  const s = $derived(viewer.settings);
  const forumName = $derived(String(s['general.forumName'] ?? 'Forum'));
  const banner = $derived(s['appearance.bannerEnabled'] !== false);
</script>

{#snippet account()}
  {#if viewer.user}
    <CreateMenu class="hidden text-white sm:inline-flex" />
    <span class="mx-1 hidden h-6 w-px bg-white/25 sm:block"></span>
    <NotificationBell unread={viewer.user.unreadNotifications} class="text-white hover:bg-white/10 hover:text-white" />
    <MessagesButton class="text-white hover:bg-white/10 hover:text-white" />
    <span class="mx-1 hidden h-6 w-px bg-white/25 sm:block"></span>
    <UserMenu {viewer} variant="named" class="text-white" />
  {:else}
    <a href={loginHref()} class="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-bold text-white transition-colors hover:bg-white/10"><SignInIcon class="size-4" />{t('Giriş yap')}</a>
    {#if s['registration.mode'] !== 'closed'}<a href="/register" class={buttonVariants()}><UserPlusIcon />{t('Kayıt ol')}</a>{/if}
  {/if}
{/snippet}

<!-- Üst alan: banner (görsel ya da desen) veya sade şerit, logo ve hesap işlemleri -->
<header data-part="site-header" class="relative isolate bg-header text-header-foreground">
  {#if banner}
    <SiteBanner aside={account} />
  {:else}
    <div class="mx-auto flex h-[88px] w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
      <a href="/" class="min-w-0" aria-label={t('{name} ana sayfa', { name: forumName })}><BrandMark size={44} nameClass="text-white" /></a>
      <div class="ml-auto flex items-center gap-1 sm:gap-2">{@render account()}</div>
    </div>
  {/if}
</header>

<!-- Menü çubuğu -->
<nav data-part="site-nav" class="sticky top-0 z-40 border-b bg-topbar text-topbar-foreground" aria-label={t('Site menüsü')}>
  <div class="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-3 sm:px-6">
    <MobileNav {nav} />
    <div class="hidden min-w-0 flex-1 md:flex"><MainNav items={nav} variant="underline" /></div>
    <div class="flex-1 md:hidden"></div>
    <button
      type="button"
      onclick={onsearch}
      class="flex h-10 w-10 items-center justify-center gap-2 rounded-full bg-background/60 px-0 text-sm text-muted-foreground transition-colors hover:text-foreground sm:w-64 sm:justify-between sm:px-4"
      aria-label={t('Ara')}
      data-part="search-trigger"
    >
      <span class="hidden sm:inline">{t('Ara…')}</span><SearchIcon class={cn('size-[18px]')} weight="bold" />
    </button>
  </div>
</nav>
