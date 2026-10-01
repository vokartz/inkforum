<script lang="ts">
  import type { NavEntry, Viewer } from '@forum/shared';
  import { goto } from '$app/navigation';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import { loginHref } from '$lib/nav-auth';
  import { profileUrl } from '$lib/viewer';
  import { formatDateTime } from '$lib/format';
  import { counters } from '$lib/counters.svelte';
  import { t } from '$lib/i18n.svelte';
  import UserAvatar from '../../UserAvatar.svelte';
  import MainNav from '../MainNav.svelte';
  import BrandMark from '../BrandMark.svelte';
  import UserMenu from '../UserMenu.svelte';
  import MobileNav from '../MobileNav.svelte';
  import ThemeToggle from '../ThemeToggle.svelte';
  import SiteBanner from '../SiteBanner.svelte';

  let { viewer, nav, onsearch }: { viewer: Viewer; nav: NavEntry[]; onsearch: () => void } = $props();

  const s = $derived(viewer.settings);
  const forumName = $derived(String(s['general.forumName'] ?? 'Forum'));
  const news = $derived(String(s['general.forumDescription'] ?? '').trim());
  const banner = $derived(s['appearance.bannerEnabled'] !== false);
  const now = Date.now();
  let q = $state('');

  function search(e: SubmitEvent) {
    e.preventDefault();
    if (q.trim()) void goto(`/search?q=${encodeURIComponent(q.trim())}`);
    else onsearch();
  }
</script>

<!-- SMF 2 "Curve" düzeni: üst bölüm (banner ya da başlık), kullanıcı alanı + haberler + arama, ortalanmış menü -->
<header data-part="site-header" class="smf-header">
  {#if banner}
    <SiteBanner inner="px-5 sm:px-7" class="smf-banner" />
  {:else}
    <div class="smf-top flex items-center gap-4 px-5 py-5 sm:px-7">
      <a href="/" class="min-w-0" aria-label={t('{name} ana sayfa', { name: forumName })}><BrandMark size={40} nameClass="text-[var(--smf-text)]" /></a>
    </div>
  {/if}

  <!-- Kullanıcı alanı -->
  <div class="smf-upper grid gap-4 px-5 py-4 text-[13px] sm:px-7 md:grid-cols-[minmax(0,1fr)_auto]">
    <div class="flex min-w-0 items-start gap-3">
      <MobileNav {nav} class="-ml-2 md:hidden" />
      {#if viewer.user}
        <a href={profileUrl(viewer.user)} class="hidden shrink-0 sm:block"><UserAvatar user={viewer.user} size={56} shape="rounded" /></a>
        <div class="grid min-w-0 leading-[1.45]">
          <span class="text-[17px] font-bold text-[var(--smf-text)]">{t('Merhaba')} <a href={profileUrl(viewer.user)} class="hover:underline">{viewer.user.displayName}</a></span>
          <a href="/unread" class="w-fit text-[var(--smf-text)] hover:underline">{t('Okunmamış konuları göster')}</a>
          <a href="/notifications" class="w-fit text-[var(--smf-text)] hover:underline">{t('Bildirimler')}{counters.notifications ? ` (${counters.notifications})` : ''}</a>
          <a href="/messages" class="w-fit text-[var(--smf-text)] hover:underline {counters.messages ? 'font-bold' : ''}">{t('Özel mesajlar')}{counters.messages ? ` (${t('{n} yeni', { n: counters.messages })})` : ''}</a>
          <span class="text-[var(--smf-text)] opacity-80">{formatDateTime(now)}</span>
        </div>
      {:else}
        <div class="grid min-w-0 leading-[1.45]">
          <span class="text-[17px] font-bold text-[var(--smf-text)]">{t('Hoş geldiniz, Misafir')}</span>
          <span class="text-[var(--smf-text)]">
            {t('Lütfen')} <a href={loginHref()} class="font-bold text-link hover:underline">{t('giriş yapın')}</a>{#if s['registration.mode'] !== 'closed'}&nbsp;{t('ya da')} <a href="/register" class="font-bold text-link hover:underline">{t('kayıt olun')}</a>{/if}.
          </span>
          <span class="text-[var(--smf-text)] opacity-80">{formatDateTime(now)}</span>
        </div>
      {/if}
    </div>
    <div class="grid content-start justify-items-start gap-2.5 md:justify-items-end">
      {#if news}<p class="max-w-md text-[var(--smf-text)] md:text-right"><b>{t('Haberler:')}</b> {news}</p>{/if}
      <div class="flex items-center gap-2">
        <form onsubmit={search} class="flex items-center gap-1.5" role="search">
          <input bind:value={q} class="h-7 w-44 rounded-[3px] border bg-background px-2 text-[13px] outline-none focus:border-ring" aria-label={t('Forumda ara')} />
          <button type="submit" class="smf-btn h-7 px-3 text-xs"><SearchIcon class="mr-1 inline size-3.5" />{t('Ara')}</button>
        </form>
        {#if viewer.user}<UserMenu {viewer} />{:else}<ThemeToggle loggedIn={false} timezone="Europe/Istanbul" />{/if}
      </div>
    </div>
  </div>

  <!-- Menü -->
  <nav data-part="site-nav" class="smf-menu mx-5 hidden border-b pb-3 sm:mx-7 md:block" aria-label={t('Site menüsü')}>
    <MainNav items={nav} variant="smf" />
  </nav>
</header>
