<script lang="ts">
  import type { SeoMeta } from '@forum/shared';
  import { page } from '$app/state';
  import { localeTag } from '$lib/i18n.svelte';

  let { settings }: { settings: Record<string, unknown> } = $props();

  const seo = $derived((page.data.seo ?? {}) as SeoMeta);
  const origin = $derived(page.url.origin);
  const abs = (u: string) => (/^https?:\/\//i.test(u) ? u : `${origin}${u.startsWith('/') ? '' : '/'}${u}`);

  const siteName = $derived(String(settings['general.forumName'] ?? 'InkForum'));
  const description = $derived((seo.description ?? String(settings['general.forumDescription'] ?? '')).slice(0, 300));
  const title = $derived(seo.title ?? siteName);
  const path = $derived(seo.canonical ?? page.url.pathname);
  const pageNo = $derived(page.url.searchParams.get('page'));
  const canonical = $derived(`${origin}${path}${!seo.canonical && pageNo && /^\d+$/.test(pageNo) && pageNo !== '1' ? `?page=${pageNo}` : ''}`);
  const ogImagesOn = $derived(settings['seo.ogImages'] !== false);
  const generated = $derived(!seo.image && ogImagesOn);
  const image = $derived(
    seo.image
      ? abs(seo.image)
      : ogImagesOn
        ? `${origin}/api/og/page.png?path=${encodeURIComponent(page.url.pathname)}`
        : abs(String(settings['appearance.bannerUrl'] || settings['appearance.logoUrl'] || '/brand/inkforum-icon-512.png')),
  );
  const ogGenerated = $derived(generated || /\/api\/og\//.test(image));
  const ogLocale = $derived(localeTag().replace('-', '_'));
  const large = $derived(seo.largeImage ?? (ogImagesOn || !!settings['appearance.bannerUrl']));
  const indexingOff = $derived(settings['seo.indexing'] === false);
  const noindex = $derived(indexingOff || seo.noindex === true || page.status >= 400);
  const twitter = $derived(String(settings['seo.twitterHandle'] ?? '').replace(/^@?/, '@'));

  const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const ldTag = (item: unknown) => `<script type="application/ld+json">${safeJson(item)}<` + '/script>';
  const website = $derived({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: `${origin}/`,
    ...(description ? { description } : {}),
    potentialAction: { '@type': 'SearchAction', target: `${origin}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
  });
  const logo = $derived(String(settings['appearance.logoUrl'] || settings['appearance.faviconUrl'] || '/brand/inkforum-icon-512.png'));
  const organization = $derived({ '@context': 'https://schema.org', '@type': 'Organization', name: siteName, url: `${origin}/`, logo: abs(logo) });
  const ld = $derived([...(page.url.pathname === '/' ? [website, organization] : []), ...(seo.jsonLd ? (Array.isArray(seo.jsonLd) ? seo.jsonLd : [seo.jsonLd]) : [])]);
</script>

<svelte:head>
  {#if description}<meta name="description" content={description} />{/if}
  {#if noindex}<meta name="robots" content="noindex, nofollow" />{:else}<link rel="canonical" href={canonical} />{/if}
  <meta property="og:site_name" content={siteName} />
  <meta property="og:locale" content={ogLocale} />
  <meta property="og:type" content={seo.type ?? 'website'} />
  <meta property="og:title" content={title} />
  {#if description}<meta property="og:description" content={description} />{/if}
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content={image} />
  {#if ogGenerated}<meta property="og:image:type" content="image/png" /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />{/if}
  {#if seo.imageAlt}<meta property="og:image:alt" content={seo.imageAlt} />{/if}
  {#if seo.type === 'article'}
    {#if seo.publishedTime}<meta property="article:published_time" content={new Date(seo.publishedTime).toISOString()} />{/if}
    {#if seo.modifiedTime}<meta property="article:modified_time" content={new Date(seo.modifiedTime).toISOString()} />{/if}
    {#if seo.section}<meta property="article:section" content={seo.section} />{/if}
    {#if seo.author}<meta name="author" content={seo.author} />{/if}
  {/if}
  <meta name="twitter:card" content={large ? 'summary_large_image' : 'summary'} />
  <meta name="twitter:title" content={title} />
  {#if description}<meta name="twitter:description" content={description} />{/if}
  <meta name="twitter:image" content={image} />
  {#if twitter.length > 1}<meta name="twitter:site" content={twitter} />{/if}
  {#if settings['seo.googleVerification']}<meta name="google-site-verification" content={String(settings['seo.googleVerification'])} />{/if}
  {#if settings['seo.bingVerification']}<meta name="msvalidate.01" content={String(settings['seo.bingVerification'])} />{/if}
  {#if settings['seo.yandexVerification']}<meta name="yandex-verification" content={String(settings['seo.yandexVerification'])} />{/if}
  {#if seo.oembed && !noindex}<link rel="alternate" type="application/json+oembed" href="{origin}/api/oembed?format=json&url={encodeURIComponent(canonical)}" title={title} />{/if}
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="apple-touch-icon" href={String(settings['appearance.faviconUrl'] || '/brand/apple-touch-icon.png')} />
  <meta name="apple-mobile-web-app-title" content={siteName} />
  {#each ld as item, i (i)}
    {@html ldTag(item)}
  {/each}
</svelte:head>
