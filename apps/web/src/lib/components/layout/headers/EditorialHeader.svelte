<script lang="ts">
  import type { NavEntry, Viewer } from '@forum/shared';
  import { page } from '$app/state';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimpleLine';
  import { buttonVariants } from '$lib/components/ui/button';
  import { loginHref } from '$lib/nav-auth';
  import { cn } from '$lib/utils';
  import { t, i18n } from '$lib/i18n.svelte';
  import ThemeToggle from '../ThemeToggle.svelte';
  import NotificationBell from '../NotificationBell.svelte';
  import MessagesButton from '../MessagesButton.svelte';
  import MainNav from '../MainNav.svelte';
  import BrandMark from '../BrandMark.svelte';
  import UserMenu from '../UserMenu.svelte';
  import MobileNav from '../MobileNav.svelte';
  import SiteBanner from '../SiteBanner.svelte';

  /** Zarif: üstte ince bilgi şeridi, ortada gazete başlığı gibi logo, altında çift çizgili ortalanmış menü */
  let { viewer, nav, onsearch }: { viewer: Viewer; nav: NavEntry[]; onsearch: () => void } = $props();

  const s = $derived(viewer.settings);
  const forumName = $derived(String(s['general.forumName'] ?? 'Forum'));
  const tagline = $derived(String(s['appearance.bannerTagline'] ?? '').trim() || String(s['general.forumDescription'] ?? '').trim());
  const bannerImage = $derived(s['appearance.bannerEnabled'] !== false && !!s['appearance.bannerUrl']);
  const today = $derived(new Date().toLocaleDateString(i18n.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  const newTopicHref = $derived.by(() => {
    const m = /^\/f\/(\d+)/.exec(page.url.pathname);
    return m ? `/f/${m[1]}/new` : '/new';
  });
</script>

<header data-part="site-header" class="bg-header text-header-foreground">
  <!-- Bilgi şeridi: tarih, arama ve hesap -->
  <div class="border-b">
    <div class="mx-auto flex h-11 w-full max-w-7xl items-center gap-1.5 px-3 text-xs sm:px-6">
      <MobileNav {nav} />
      <span class="hidden text-muted-foreground capitalize sm:inline">{today}</span>
      <span class="flex-1"></span>
      <button type="button" onclick={onsearch} class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-xs')} data-part="search-trigger"><SearchIcon class="size-4" />{t('Ara')}</button>
      {#if viewer.user}
        <a href={newTopicHref} class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden text-xs sm:inline-flex')} data-part="new-topic"><PencilIcon class="size-4" />{t('Yeni konu')}</a>
        <MessagesButton />
        <NotificationBell unread={viewer.user.unreadNotifications} />
        <UserMenu {viewer} class="ml-0.5" />
      {:else}
        <ThemeToggle loggedIn={false} timezone="Europe/Istanbul" class="hidden sm:inline-flex" />
        <a href={loginHref()} class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-xs')}>{t('Giriş yap')}</a>
        {#if s['registration.mode'] !== 'closed'}<a href="/register" class={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-xs')}>{t('Kayıt ol')}</a>{/if}
      {/if}
    </div>
  </div>

  <!-- Başlık: yüklenen banner görseli ya da ortalanmış logo ve slogan -->
  {#if bannerImage}
    <SiteBanner center />
  {:else}
    <div class="mx-auto grid w-full max-w-7xl justify-items-center gap-2 px-4 py-8 text-center sm:py-10">
      <a href="/" class="min-w-0" aria-label={t('{name} ana sayfa', { name: forumName })}><BrandMark size={56} class="justify-center" /></a>
      {#if tagline}<p class="max-w-2xl text-sm text-muted-foreground italic sm:text-base" style="font-family:var(--heading-font)" data-part="banner-tagline">{tagline}</p>{/if}
    </div>
  {/if}
</header>

<nav data-part="site-nav" class="editorial-rule sticky top-0 z-40 bg-topbar/95 text-topbar-foreground backdrop-blur" aria-label={t('Site menüsü')}>
  <div class="mx-auto hidden w-full max-w-7xl px-3 sm:px-6 md:flex"><MainNav items={nav} variant="editorial" /></div>
</nav>
