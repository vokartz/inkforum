<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import { readableOn } from '$lib/theme.svelte';
  import BrandMark from './BrandMark.svelte';

  interface Props {
    /** Yükseklik (px); boşsa yönetimdeki "Banner yüksekliği" */
    height?: number;
    class?: string;
    /** İçerik alanının genişlik sınıfı (temaya göre) */
    inner?: string;
    /** Sağ taraf (hesap düğmeleri vb.) */
    aside?: Snippet;
    /** Logo ve slogan ortada (Zarif teması) */
    center?: boolean;
  }
  let { height, class: className, inner = 'mx-auto max-w-7xl px-4 sm:px-6', aside, center = false }: Props = $props();

  const s = $derived(page.data.viewer?.settings ?? {});
  const forumName = $derived(String(s['general.forumName'] ?? 'Forum'));
  const image = $derived(s['appearance.bannerUrl'] as string | null | undefined);
  const tagline = $derived(String(s['appearance.bannerTagline'] ?? '').trim());
  const h = $derived(height ?? Number(s['appearance.bannerHeight'] ?? 160));
  const logoSize = $derived(Math.max(32, Math.min(84, Math.round(h * 0.4))));
  // Görsel yoksa düz renk; yazı ve logo rengi zeminin açıklığına göre
  const color = $derived(/^#[0-9a-fA-F]{6}$/.test(String(s['appearance.bannerColor'] ?? '')) ? String(s['appearance.bannerColor']) : '#16171b');
  const lightSurface = $derived(!image && readableOn(color) !== '#ffffff');
</script>

<!-- Banner: yüklenen görsel ya da düz renk (Yönetim → Görünüm) -->
<div
  data-part="site-banner"
  data-generated={image ? undefined : ''}
  class={cn('relative isolate h-[calc(var(--bh)*0.7)] overflow-hidden sm:h-[var(--bh)]', lightSurface ? 'text-zinc-900' : 'text-white', className)}
  style="--bh:{h}px;{image ? '' : `background:${color}`}"
>
  {#if image}
    <div class="absolute inset-0 -z-10 bg-cover bg-center" style="background-image:url('{image}')"></div>
    <div class="absolute inset-0 -z-10 bg-gradient-to-r from-black/45 via-black/10 to-transparent"></div>
  {/if}
  <div class={cn('flex h-full items-center gap-4', center && 'justify-center text-center', inner)}>
    <a href="/" class="min-w-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-white/50" aria-label={t('{name} ana sayfa', { name: forumName })}>
      <BrandMark size={logoSize} class={center ? 'justify-center' : undefined} surface={lightSurface ? 'light' : 'dark'} nameClass={lightSurface ? 'text-zinc-900' : 'text-white drop-shadow-lg'} />
      {#if tagline}<span class={cn('mt-1.5 block max-w-xl truncate text-sm font-medium sm:text-base', center && 'mx-auto', lightSurface ? 'text-zinc-700' : 'text-white/85 drop-shadow')} data-part="banner-tagline">{tagline}</span>{/if}
    </a>
    {#if aside}<div class="ml-auto flex items-center gap-1 sm:gap-2">{@render aside()}</div>{/if}
  </div>
</div>
