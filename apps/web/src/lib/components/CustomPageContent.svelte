<script lang="ts">
  import type { CustomPageView } from '@forum/shared';
  import { untrack } from 'svelte';
  import { browser } from '$app/environment';
  import { page as appPage } from '$app/state';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import HouseIcon from 'phosphor-svelte/lib/House';
  import ShieldWarningIcon from 'phosphor-svelte/lib/ShieldWarning';
  import CustomHtml from '$lib/components/CustomHtml.svelte';
  import BuilderPage from '$lib/components/builder/BuilderPage.svelte';
  import { Button } from '$lib/components/ui/button';
  import { setForumPage } from '$lib/custom-code';
  import { defineForumElements } from '$lib/forum-elements';
  import { formatDate } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  /**
   * Özel sayfa: HTML / BBCode içerik, sayfaya özel CSS ve JS, isteğe bağlı kenar çubuğu.
   * Sayfanın JS'i `window.forum.page` (sunucu verisi) ve `forum.api()` ile sunucu koduna ulaşır.
   */
  let { page: p, safeMode = false }: { page: CustomPageView; safeMode?: boolean } = $props();
  const viewer = $derived(appPage.data.viewer);
  const canEdit = $derived(!!viewer?.isAdmin);
  // Güvenli modda ya da özel kod kapalıyken HTML sayfaların kodu çalıştırılmaz.
  const blocked = $derived(p.format === 'html' && (safeMode || !p.html));
  const code = $derived(!safeMode);
  const sidebar = $derived(code && p.layout !== 'blank' && p.sidebar && p.sidebar !== 'none' && p.sidebarHtml ? p.sidebar : null);
  const css = $derived(code && p.css ? `<style data-page-css>${p.css.replace(/<\/style/gi, '<\\/style')}</style>` : '');
  // Sayfanın JS'i içerikten sonra, kendi betiği olarak çalışır (CSP nonce'u runScripts ekler)
  const CLOSE = '</' + 'script>';
  const script = $derived(code && p.js ? `<script>${p.js.replace(/<\/script/gi, '<\\/script')}${CLOSE}` : '');

  /** Sunucu verisi şablonlarda {{data.alan}} olarak kullanılabilir (3 düzeye kadar) */
  const dataVars = $derived.by(() => {
    const out: Record<string, string> = {};
    const walk = (v: unknown, key: string, depth: number) => {
      if (v === null || v === undefined) return;
      if (typeof v === 'object') {
        if (depth >= 3 || Array.isArray(v)) return;
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${key}.${k}`, depth + 1);
      } else out[key] = String(v);
    };
    walk(p.data, 'data', 0);
    return out;
  });

  function install() {
    const u = viewer?.user;
    setForumPage(
      { id: u?.id ?? 0, username: u?.username ?? '', displayName: u?.displayName ?? '', group: u?.primaryGroup?.name ?? null, isGuest: !u, avatarUrl: u?.avatarUrl ?? null },
      { id: p.id, slug: p.slug, route: p.route ?? null, title: p.title, data: p.data ?? null },
    );
  }
  // Sayfanın betikleri (alt bileşen) takılmadan önce forum.page ve bileşenler hazır olmalı
  if (browser) {
    untrack(install);
    defineForumElements();
  }
  $effect(() => {
    install();
    return () => {
      if (window.forum) window.forum.page = null;
    };
  });
</script>

<svelte:head>
  <title>{p.isLanding ? viewer?.settings['general.forumName'] : `${p.title} · ${viewer?.settings['general.forumName']}`}</title>
  {#if p.metaDescription}<meta name="description" content={p.metaDescription} />{/if}
  {@html css}
</svelte:head>

{#snippet adminBar(floating = false)}
  {#if canEdit || !p.isPublished}
    <div
      class={cn(
        'flex flex-wrap items-center gap-2 text-sm text-muted-foreground',
        floating ? 'fixed right-4 bottom-4 z-40 rounded-full border bg-popover/95 py-1.5 pr-1.5 pl-4 text-xs shadow-lg backdrop-blur' : 'mb-4 rounded-md border border-dashed px-3 py-2',
      )}
      data-part="page-admin-bar"
    >
      {#if !p.isPublished}<span class="inline-flex items-center gap-1.5 font-semibold text-warning"><EyeSlashIcon class="size-4" />{floating ? t('Taslak') : t('Taslak — yalnızca yöneticiler görüyor')}</span>{/if}
      {#if p.isLanding}<span class="inline-flex items-center gap-1.5 font-semibold text-highlight"><HouseIcon class="size-4" />{t('Açılış sayfası')}</span>{/if}
      {#if !floating}<span class="text-xs">{t('Son güncelleme {date}', { date: formatDate(p.updatedAt) })}</span>{/if}
      {#if canEdit}<Button href="/admin/pages/{p.id}" variant={floating ? 'default' : 'outline'} size="sm" class={floating ? 'rounded-full' : 'ml-auto'}><PencilIcon />{t('Sayfayı düzenle')}</Button>{/if}
    </div>
  {/if}
{/snippet}

{#snippet content()}
  {#if blocked}
    <p class="flex items-center gap-2 rounded-md bg-muted px-4 py-6 text-sm text-muted-foreground"><ShieldWarningIcon class="size-5" />{t('Bu sayfa özel kod içeriyor; güvenli modda ya da özel kod kapalıyken gösterilmez.')}</p>
  {:else if p.format === 'builder'}
    <BuilderPage blocks={p.blocks ?? []} standalone={p.layout === 'blank'} />
  {:else if p.format === 'html'}
    <CustomHtml html={p.html} vars={dataVars} part="custom-page" />
  {:else}
    <div class="prose-forum">{@html p.html}</div>
  {/if}
  {#if script}<CustomHtml html={script} part="custom-page-script" class="hidden" />{/if}
{/snippet}

{#snippet aside()}
  <aside class="grid min-w-0 content-start gap-4 lg:sticky lg:top-24" data-part="custom-page-sidebar">
    <CustomHtml html={p.sidebarHtml ?? ''} vars={dataVars} part="custom-page-sidebar-html" />
  </aside>
{/snippet}

{#snippet withSidebar(main: import('svelte').Snippet)}
  {#if sidebar}
    <div class={cn('grid items-start gap-6', sidebar === 'left' ? 'lg:grid-cols-[18rem_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)_18rem]')} data-part="custom-page-layout">
      {#if sidebar === 'left'}{@render aside()}{/if}
      <div class="min-w-0">{@render main()}</div>
      {#if sidebar === 'right'}{@render aside()}{/if}
    </div>
  {:else}
    {@render main()}
  {/if}
{/snippet}

{#snippet wide()}
  {#if p.showTitle && p.format !== 'builder'}<h1 class="mb-5 text-3xl font-extrabold tracking-tight">{p.title}</h1>{/if}
  {@render content()}
{/snippet}

{#snippet card()}
  <article class="rounded-xl border bg-card px-5 py-6 sm:px-8 sm:py-8" data-part="custom-page-card">
    {#if p.showTitle}<h1 class="mb-5 border-b pb-4 text-3xl font-extrabold tracking-tight">{p.title}</h1>{/if}
    {@render content()}
  </article>
{/snippet}

<div data-custom-page={p.slug} class="contents">
  {#if p.layout === 'blank'}
    <!-- Ayrı site: forum çerçevesi yok; yönetici çubuğu sağ altta -->
    {@render adminBar(true)}
    {@render content()}
  {:else if p.layout === 'wide' || p.format === 'builder'}
    {@render adminBar(p.format === 'builder')}
    {@render withSidebar(wide)}
  {:else}
    <div class={cn('mx-auto', sidebar ? 'max-w-6xl' : 'max-w-4xl')}>
      {@render adminBar()}
      {@render withSidebar(card)}
    </div>
  {/if}
</div>
