<script lang="ts">
  import '../app.css';
  import '$lib/page-kit.css';
  import { FONT_OPTIONS } from '@forum/shared';
  import { onMount } from 'svelte';
  import { page, navigating } from '$app/state';
  import { afterNavigate, beforeNavigate, invalidate, onNavigate } from '$app/navigation';
  import { tick, untrack } from 'svelte';
  import { browser } from '$app/environment';
  import type { SnippetPlacement, SnippetView } from '@forum/shared';
  import ShieldWarningIcon from 'phosphor-svelte/lib/ShieldWarning';
  import CustomHtml from '$lib/components/CustomHtml.svelte';
  import { activateScripts, customScriptsRan, deferScripts, emitNavigate, fillTemplate, installForumApi } from '$lib/custom-code';
  import { setCustomVars } from '$lib/custom-vars';
  import WrenchIcon from 'phosphor-svelte/lib/Wrench';
  import TriangleAlertIcon from 'phosphor-svelte/lib/Warning';
  import { Toaster } from '$lib/components/ui/sonner';
  import SiteHeader from '$lib/components/layout/SiteHeader.svelte';
  import SiteFooter from '$lib/components/layout/SiteFooter.svelte';
  import CookieBanner from '$lib/components/layout/CookieBanner.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import NavProgress from '$lib/components/layout/NavProgress.svelte';
  import SeoHead from '$lib/components/layout/SeoHead.svelte';
  import { setLocale, t } from '$lib/i18n.svelte';
  import { theme, readableOn } from '$lib/theme.svelte';
  import { formatDate } from '$lib/format';
  import { installEmbedRuntime } from '$lib/embed-runtime';
  import { counters } from '$lib/counters.svelte';
  import { realtime } from '$lib/realtime.svelte';
  import { THEME_PREVIEW_MESSAGE } from '$lib/theme-preview';
  import { DEFAULT_MAINTENANCE_PAGE, themeHtmlAttrs, type ActiveTheme, type MaintenancePage } from '@forum/shared';
  import MaintenanceScreen from '$lib/components/MaintenanceScreen.svelte';

  let { data, children } = $props();
  const viewer = $derived(data.viewer);
  // Dil: sunucunun belirlediği değer (çizimden önce, eşzamanlı)
  setLocale(untrack(() => data.viewer.locale));
  $effect.pre(() => setLocale(data.viewer.locale));
  const s = $derived(viewer.settings);

  onMount(() => installEmbedRuntime());

  // ---------- Özel kod (yönetimden eklenen HTML / CSS / JS) ----------
  const custom = $derived(data.custom);
  const byPlacement = $derived.by(() => {
    const out: Partial<Record<SnippetPlacement, SnippetView[]>> = {};
    for (const sn of custom?.snippets ?? []) (out[sn.placement] ??= []).push(sn);
    return out;
  });
  const templateVars = $derived({
    'forum.name': String(s['general.forumName'] ?? ''),
    'forum.url': page.url.origin,
    'viewer.id': viewer.user?.id ?? 0,
    'viewer.username': viewer.user?.username ?? '',
    'viewer.displayName': viewer.user?.displayName ?? '',
    'viewer.group': viewer.user?.primaryGroup?.name ?? '',
  });
  setCustomVars(() => templateVars);
  const headHtml = $derived((byPlacement.head ?? []).map((sn) => fillTemplate(sn.html, templateVars)).join('\n'));
  const customCss = $derived(custom?.css ? `<style data-forum-custom>${custom.css.replace(/<\/style/gi, '<\\/style')}</style>` : '');
  $effect(() => {
    if (!headHtml) return;
    void tick().then(() => activateScripts(document.head));
  });
  function forumApiViewer() {
    const u = viewer.user;
    return { id: u?.id ?? 0, username: u?.username ?? '', displayName: u?.displayName ?? '', group: u?.primaryGroup?.name ?? null, isGuest: !u, avatarUrl: u?.avatarUrl ?? null };
  }
  // window.forum, sayfadaki parçacıklar çalışmadan önce hazır olmalı (alt bileşenler layout efektinden önce takılır).
  if (browser && untrack(() => data.custom)) installForumApi(untrack(forumApiViewer));
  $effect(() => {
    if (custom) installForumApi(forumApiViewer());
  });
  afterNavigate((nav) => {
    if (nav.type !== 'enter' && nav.to) emitNavigate(nav.to.url);
  });
  // Özel betik çalışmış bir sekmede yönetim paneli her zaman temiz (tam) yüklenir.
  beforeNavigate((nav) => {
    if (nav.type === 'leave' || !nav.to || !nav.to.url.pathname.startsWith('/admin') || page.url.pathname.startsWith('/admin')) return;
    if (!customScriptsRan()) return;
    nav.cancel();
    location.href = nav.to.url.href;
  });

  // Okunmamış bildirim / mesaj sayaçları: sayfa verisiyle eşitlenir, üyelerde düzenli tazelenir.
  $effect.pre(() => {
    counters.set({ notifications: viewer.user?.unreadNotifications ?? 0, messages: viewer.user?.unreadMessages ?? 0 });
  });
  $effect(() => {
    if (!viewer.user) return;
    const stopPolling = counters.start();
    const stopStream = realtime.start();
    return () => (stopPolling(), stopStream());
  });

  // Okunmamışlar sekme başlığında: "(3) Konu başlığı"
  $effect(() => {
    const n = viewer.user ? counters.notifications + counters.messages : 0;
    void page.url.pathname;
    void tick().then(() => {
      const base = document.title.replace(/^\(\d+\+?\) /, '');
      document.title = n > 0 ? `(${n > 99 ? '99+' : n}) ${base}` : base;
    });
  });

  // Tema tercihi ve forumun varsayılan modu istemci durumuyla eşitlenir.
  // init, tercih durumunu okur; untrack olmazsa her geçişte etki yeniden çalışıp tercihi sunucudaki eski değere döndürür.
  function syncTheme() {
    const pref = data.theme;
    const forumDefault = data.themeDefault;
    untrack(() => theme.init(pref, forumDefault));
  }
  syncTheme();
  $effect.pre(syncTheme);

  // Sayfa geçişlerinde yumuşak çapraz geçiş (destekleyen tarayıcılarda, hareket azaltma kapalıyken).
  onNavigate((nav) => {
    const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };
    if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (nav.from?.url.pathname === nav.to?.url.pathname) return;
    return new Promise((resolve) => {
      doc.startViewTransition!(async () => {
        resolve();
        await nav.complete;
      });
    });
  });

  // Uzun süren geçişlerde içerik hafifçe soluklaşır (ilerleme çubuğuyla birlikte).
  let slow = $state(false);
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    clearTimeout(slowTimer);
    if (navigating.to) slowTimer = setTimeout(() => (slow = true), 350);
    else slow = false;
  });

  const accent = $derived(String(s['appearance.accentColor'] ?? '#7b61ff'));
  const fontFamily = $derived(FONT_OPTIONS.find((f) => f.key === s['appearance.fontFamily'])?.family ?? FONT_OPTIONS[0].family);
  // Renk yayılımı: vurgu renginin yüzeylere karışma oranı (theme-tokens.css → --tint)
  const TINT: Record<string, number> = { none: 0, soft: 3, medium: 6, strong: 11 };
  const tint = $derived(TINT[String(s['appearance.colorSpread'] ?? 'none')] ?? 0);
  // `html` önekiyle tema dosyasındaki varsayılanlardan her zaman baskın gelir (yükleme sırasından bağımsız).
  // BBCode alıntı başlığındaki "yazdı:" / "Alıntı:" kayıtlı HTML'de yer almaz; ziyaretçinin dilinde buradan gelir (app.css)
  const cssString = (v: string) => `"${v.replace(/[\\"]/g, '\\$&').replace(/</g, '\\3c ').replace(/\n/g, ' ')}"`;
  const accentCss = $derived(
    `html:root{--app-font:${fontFamily};--tint:${tint};--bb-quote-says:${cssString(t('yazdı:'))};--bb-quote-label:${cssString(t('Alıntı:'))}}` +
      (/^#[0-9a-fA-F]{6}$/.test(accent) ? `html:root,html[data-theme]{--primary:${accent};--primary-foreground:${readableOn(accent)}}` : ''),
  );
  const embedColor = $derived(String((s['seo.ogCard'] as { embedColor?: string } | undefined)?.embedColor ?? ''));
  const favicon = $derived(s['appearance.faviconUrl'] as string | null | undefined);
  // Site simgesi app.html'de sunucuda yazılır; yönetimden değişince sayfa yenilenmeden güncellenir.
  $effect(() => {
    const href = favicon || '/brand/inkforum-icon-192.png';
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link && link.getAttribute('href') !== href) link.href = href;
  });
  // Tema ve köşe ayarı sunucuda <html> üzerine yazılır; yönetimden değişince istemcide de güncellenir.
  const themeStyle = $derived(String(s['appearance.themeStyle'] ?? 'modern'));
  $effect(() => {
    document.documentElement.dataset.style = themeStyle;
    document.documentElement.dataset.radius = String(s['appearance.radius'] ?? 'auto');
  });
  // Tema stüdyosunda oluşturulan etkin tema: derlenmiş CSS, <html> öznitelikleri ve HTML bölmeleri
  const activeTheme = $derived(s['appearance.theme'] as ActiveTheme | null | undefined);
  const themed = $derived(!!activeTheme && !page.url.pathname.startsWith('/admin'));
  $effect(() => {
    const el = document.documentElement;
    for (const k of ['data-custom-theme', 'data-sidebar', 'data-forum-list', 'data-header']) el.removeAttribute(k);
    if (themed && activeTheme) for (const [k, v] of Object.entries(themeHtmlAttrs(activeTheme))) el.setAttribute(k, v);
  });
  // Stüdyo önizlemesi: düzenleyici taslağı güncelleyince çerçeve yeniden çizilir
  onMount(() => {
    if (window.self === window.top) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin === location.origin && (e.data as { type?: string } | null)?.type === THEME_PREVIEW_MESSAGE) void invalidate('app:theme-preview');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });
  const themeSlot = (k: 'beforeHeader' | 'afterHeader' | 'beforeFooter' | 'afterFooter') => (themed && !data.safeMode ? (activeTheme?.html?.[k] ?? '').trim() : '');

  const pageBg = $derived(s['appearance.backgroundUrl'] as string | null | undefined);
  const pageBgDim = $derived(Math.min(95, Math.max(0, Number(s['appearance.backgroundDim'] ?? 80))));

  const maintenance = $derived(s['general.maintenanceMode'] === true && !viewer.isAdmin && !page.url.pathname.startsWith('/login'));
  const isAdminArea = $derived(page.url.pathname.startsWith('/admin'));
  // Giriş, kayıt ve şifre sayfaları kendi tam ekran düzenini çizer (üst çubuk / alt bilgi yok).
  const isAuthArea = $derived(/^\/(login|register|forgot-password|reset-password)(\/|$)/.test(page.url.pathname));
  // Özel sayfaların "boş" düzeni: üst çubuk ve alt bilgi olmadan (UCP, açılış sayfası…).
  const isBare = $derived(page.data.bare === true);
  // Başka sitelere gömülen kartlarda özel kod çalışmaz
  const isEmbed = $derived(page.url.pathname.startsWith('/embed/'));
</script>

<SeoHead settings={s} />

<svelte:head>
  <!-- Vurgu rengi: mobil tarayıcı çubuğu ve Discord / Slack gömme kartının kenar rengi -->
  <!-- Discord gibi uygulamalarda bağlantı önizlemesinin kenar rengi (SEO → Paylaşım kartı) -->
  <meta name="theme-color" content={embedColor || (/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : theme.resolved === 'dark' ? '#0f1219' : '#f6f7fb')} />
  {#if accentCss}{@html `<style>${accentCss}</style>`}{/if}
  {#if themed && activeTheme?.css}{@html `<style data-forum-theme>${activeTheme.css.replace(/<\/style/gi, '<\\/style')}</style>`}{/if}
  {#if !isAdminArea && !isEmbed}
    {#if customCss}{@html customCss}{/if}
    {#if headHtml}{@html deferScripts(headHtml)}{/if}
  {/if}
</svelte:head>

{#snippet placement(key: SnippetPlacement)}
  {#each byPlacement[key] ?? [] as sn (sn.id)}<CustomHtml html={sn.html} part="custom-{key}" />{/each}
{/snippet}

{#if data.safeMode && !isAdminArea}
  <div class="border-b border-warning/40 bg-warning/15 text-sm" data-part="safe-mode">
    <div class="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 sm:px-6">
      <ShieldWarningIcon class="size-4 shrink-0" weight="fill" /> {t('Güvenli mod açık — özel HTML / CSS / JavaScript kodları çalışmıyor.')}
      <a href="?safemode=0" data-sveltekit-reload class="ml-auto font-semibold underline">{t('Kapat')}</a>
    </div>
  </div>
{/if}

{#if maintenance}
  <MaintenanceScreen
    cfg={(s['general.maintenancePage'] as MaintenancePage | undefined) ?? DEFAULT_MAINTENANCE_PAGE}
    forumName={String(s['general.forumName'] ?? '')}
    message={String(s['general.maintenanceMessage'] ?? '')}
    logoUrl={(s['appearance.logoUrl'] as string | null) ?? null}
    social={(s['appearance.socialLinks'] ?? []) as Array<{ platform: string; url: string }>}
    loggedIn={!!viewer.user}
  />
{:else if isAdminArea}
  {@render children()}
{:else if isAuthArea || isBare}
  {@render children()}
  {#if !isEmbed}{@render placement('bodyEnd')}{/if}
{:else}
  {#if pageBg}
    <!-- Forumun genel arka planı: görsel + okunurluk için tema renginde örtü -->
    <div class="pointer-events-none fixed inset-0 -z-10" data-part="page-background" aria-hidden="true">
      <div class="absolute inset-0 bg-cover bg-center" style="background-image:url('{pageBg}')"></div>
      <div class="absolute inset-0" style="background:color-mix(in oklch, var(--background) {pageBgDim}%, transparent)"></div>
    </div>
  {/if}
  <div class="flex min-h-dvh flex-col">
    <!-- Klasik temada (SMF) üst alan ve içerik ortalanmış tek bir çerçevede -->
    <div data-part="site-shell" class="contents">
    {#if themeSlot('beforeHeader')}<CustomHtml html={themeSlot('beforeHeader')} part="theme-before-header" />{/if}
    <SiteHeader {viewer} nav={data.nav} />
    {#if themeSlot('afterHeader')}<CustomHtml html={themeSlot('afterHeader')} part="theme-after-header" />{/if}
    {#if viewer.flags.ban && !viewer.flags.ban.cannotAccess}
      <div class="border-b border-destructive/30 bg-destructive/10 text-sm text-destructive">
        <div class="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 sm:px-6">
          <TriangleAlertIcon class="size-4 shrink-0" />
          <span>
            {viewer.flags.ban.reason ? t('Hesabınız kısıtlandı: {reason}', { reason: viewer.flags.ban.reason }) : t('Hesabınız kısıtlandı.')}
            {#if viewer.flags.ban.expiresAt}{t('(Bitiş: {date})', { date: formatDate(viewer.flags.ban.expiresAt) })}{/if}
          </span>
        </div>
      </div>
    {/if}
    {#if s['general.maintenanceMode'] === true && viewer.isAdmin}
      <div class="border-b border-warning/40 bg-warning/15 text-sm">
        <div class="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 sm:px-6">
          <WrenchIcon class="size-4" /> {t('Bakım modu açık — forum yalnızca yöneticilere görünüyor.')}
          <a href="/admin/settings/general" class="ml-auto underline">{t('Ayarlar')}</a>
        </div>
      </div>
    {/if}
    <main
      data-part="page"
      data-print-title="{s['general.forumName']} · {page.url.origin}{page.url.pathname}"
      class="mx-auto w-full max-w-[var(--page-width,80rem)] flex-1 px-4 py-6 transition-opacity duration-300 sm:px-6 sm:py-8 {slow ? 'opacity-60' : ''}"
      style="view-transition-name: page"
    >
      {#if byPlacement.afterHeader}<div class="mb-6 grid gap-4" data-part="custom-after-header">{@render placement('afterHeader')}</div>{/if}
      {@render children()}
      {#if byPlacement.beforeFooter}<div class="mt-6 grid gap-4" data-part="custom-before-footer">{@render placement('beforeFooter')}</div>{/if}
    </main>
    </div>
    {#if themeSlot('beforeFooter')}<CustomHtml html={themeSlot('beforeFooter')} part="theme-before-footer" />{/if}
    <SiteFooter {viewer} />
    {#if themeSlot('afterFooter')}<CustomHtml html={themeSlot('afterFooter')} part="theme-after-footer" />{/if}
  </div>
  {@render placement('bodyEnd')}
  {#if s['cookies.bannerEnabled'] !== false}<CookieBanner text={String(s['cookies.bannerText'] ?? '')} />{/if}
{/if}

<NavProgress />
<Toaster richColors position="top-center" />
<ConfirmDialog />
