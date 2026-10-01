<script lang="ts">
  import type { MaintenancePage } from '@forum/shared';
  import { onMount } from 'svelte';
  import WrenchIcon from 'phosphor-svelte/lib/Wrench';
  import ClockIcon from 'phosphor-svelte/lib/Clock';
  import RocketIcon from 'phosphor-svelte/lib/RocketLaunch';
  import HammerIcon from 'phosphor-svelte/lib/Hammer';
  import BrandIcon from './BrandIcon.svelte';
  import CustomHtml from './CustomHtml.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  /**
   * Bakım modu ekranı. Ziyaretçilere ve Yönetim → Bakım sayfası önizlemesinde aynı bileşen çizilir.
   * `preview`: çerçeve içinde (tam ekran değil), betikler ve otomatik yenileme çalışmaz.
   */
  interface Props {
    cfg: MaintenancePage;
    forumName: string;
    message: string;
    logoUrl?: string | null;
    social?: Array<{ platform: string; url: string }>;
    loggedIn?: boolean;
    preview?: boolean;
  }
  let { cfg, forumName, message, logoUrl = null, social = [], loggedIn = false, preview = false }: Props = $props();

  const ICONS = { wrench: WrenchIcon, clock: ClockIcon, rocket: RocketIcon, hammer: HammerIcon } as const;
  const Icon = $derived(cfg.icon in ICONS ? ICONS[cfg.icon as keyof typeof ICONS] : null);
  const title = $derived(cfg.title.trim() || t('{name} bakımda', { name: forumName }));
  const bg = $derived(cfg.background);

  /** Arka plan katmanı (theme = sitenin kendi zemini) */
  const bgStyle = $derived(
    bg.kind === 'color'
      ? `background:${bg.color}`
      : bg.kind === 'gradient'
        ? `background:linear-gradient(${bg.angle}deg,${bg.from},${bg.to})`
        : bg.kind === 'image' && bg.image
          ? `background:#0b0b0f url("${bg.image.replace(/["\\]/g, '')}") center/cover no-repeat`
          : '',
  );
  // Yazı rengi: koyu zeminlerde açık, sitenin zemininde temaya göre
  const light = $derived(cfg.text === 'light' || (cfg.text === 'auto' && bg.kind !== 'theme'));
  const dark = $derived(cfg.text === 'dark');
  /** Bölünmüş düzende zemin sol panelde, içerik sitenin zemininde */
  const split = $derived(cfg.layout === 'split');

  // Geri sayım
  let now = $state(Date.now());
  const left = $derived(cfg.endsAt ? Math.max(0, cfg.endsAt - now) : 0);
  const parts = $derived([
    { v: Math.floor(left / 86_400_000), l: t('gün') },
    { v: Math.floor(left / 3_600_000) % 24, l: t('saat') },
    { v: Math.floor(left / 60_000) % 60, l: t('dakika') },
    { v: Math.floor(left / 1000) % 60, l: t('saniye') },
  ]);
  onMount(() => {
    const timer = setInterval(() => {
      now = Date.now();
      // Süre dolunca site açılmış olabilir: sayfa bir kez yenilenir
      if (!preview && cfg.endsAt && now >= cfg.endsAt + 3000 && now - cfg.endsAt < 60_000) location.reload();
    }, 1000);
    return () => clearInterval(timer);
  });
  const pad = (n: number) => String(n).padStart(2, '0');
</script>

{#snippet content(onImage: boolean)}
  <div class={cn('grid w-full justify-items-center gap-5 text-center', onImage ? 'text-white' : dark ? 'text-zinc-900' : '')}>
    {#if cfg.icon === 'logo' && logoUrl}
      <img src={logoUrl} alt={forumName} class="max-h-14 w-auto" />
    {:else if Icon}
      <span class={cn('flex size-14 items-center justify-center rounded-2xl', onImage ? 'bg-white/15 backdrop-blur' : 'bg-primary-soft text-primary')}>
        <Icon class="size-7" weight="duotone" />
      </span>
    {/if}
    <div class="grid gap-2.5">
      <h1 class="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl" data-part="maintenance-title">{title}</h1>
      {#if message}<p class={cn('mx-auto max-w-md text-[15px] leading-relaxed whitespace-pre-line', onImage ? 'text-white/80' : 'text-muted-foreground')}>{message}</p>{/if}
    </div>

    {#if cfg.endsAt && left > 0}
      <div class="flex gap-2" data-part="maintenance-countdown" aria-label={t('Kalan süre')}>
        {#each parts as p, i (i)}
          {#if i > 0 || p.v > 0}
            <div class={cn('grid min-w-16 rounded-xl px-3 py-2.5', onImage ? 'bg-white/12 backdrop-blur' : 'border bg-card')}>
              <span class="text-2xl leading-none font-extrabold tabular-nums">{pad(p.v)}</span>
              <span class={cn('mt-1 text-[11px] font-medium uppercase tracking-wide', onImage ? 'text-white/70' : 'text-muted-foreground')}>{p.l}</span>
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    {#if cfg.progress !== null}
      <div class="grid w-full max-w-xs gap-1.5" data-part="maintenance-progress">
        <div class={cn('h-2 overflow-hidden rounded-full', onImage ? 'bg-white/20' : 'bg-muted')}>
          <div class="h-full rounded-full bg-primary transition-[width]" style="width:{cfg.progress}%"></div>
        </div>
        <span class={cn('text-xs font-semibold tabular-nums', onImage ? 'text-white/75' : 'text-muted-foreground')}>{t('%{n} tamamlandı', { n: cfg.progress })}</span>
      </div>
    {/if}

    {#if cfg.buttons.length}
      <div class="flex flex-wrap justify-center gap-2">
        {#each cfg.buttons as b, i (i)}
          <a
            href={b.url}
            target={/^https?:/.test(b.url) ? '_blank' : undefined}
            rel={/^https?:/.test(b.url) ? 'noopener noreferrer' : undefined}
            class={cn(
              'inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold transition-opacity hover:opacity-90',
              i === 0 ? 'bg-primary text-primary-foreground' : onImage ? 'bg-white/15 text-white backdrop-blur' : 'border bg-card',
            )}>{b.label}</a
          >
        {/each}
      </div>
    {/if}

    {#if cfg.html}
      {#if preview}
        <div class={cn('w-full rounded-lg border border-dashed px-3 py-2 text-xs', onImage ? 'border-white/30 text-white/70' : 'text-muted-foreground')}>{t('Özel HTML burada gösterilir')}</div>
      {:else}
        <CustomHtml html={cfg.html} class="w-full" part="maintenance-html" />
      {/if}
    {/if}

    {#if cfg.social && social.length}
      <div class="flex items-center gap-4">
        {#each social as l, i (l.url + i)}
          <a href={l.url} target="_blank" rel="noopener noreferrer" aria-label={l.platform} class={cn('transition-opacity hover:opacity-100', onImage ? 'opacity-75' : 'text-muted-foreground opacity-80')}>
            <BrandIcon platform={l.platform} size={20} />
          </a>
        {/each}
      </div>
    {/if}

    {#if cfg.showLogin && !loggedIn}
      <a href="/login" class={cn('text-xs font-semibold underline-offset-4 hover:underline', onImage ? 'text-white/70' : 'text-muted-foreground')}>{t('Yönetici girişi')}</a>
    {/if}
  </div>
{/snippet}

<main
  data-part="maintenance"
  class={cn('relative isolate flex overflow-hidden', preview ? 'h-full min-h-full' : 'min-h-dvh', split ? 'flex-col md:flex-row' : 'items-center justify-center px-6 py-12')}
>
  <!-- Özel CSS önizlemede uygulanmaz (yönetim panelini etkilemesin) -->
  {#if cfg.css && !preview}{@html `<style>${cfg.css.replace(/<\/style/gi, '<\\/style')}</style>`}{/if}

  {#if split}
    <div class="relative flex min-h-56 items-end p-8 md:min-h-full md:w-1/2" style={bgStyle || 'background:var(--primary)'}>
      {#if bg.kind === 'image' && bg.image}<div class="absolute inset-0 bg-black" style="opacity:{bg.dim / 100}"></div>{/if}
      <div class="relative text-white">
        {#if logoUrl}<img src={logoUrl} alt={forumName} class="mb-3 max-h-10 w-auto" />{:else}<p class="text-2xl font-extrabold">{forumName}</p>{/if}
      </div>
    </div>
    <div class="flex flex-1 items-center justify-center px-6 py-12">
      <div class="w-full max-w-md">{@render content(false)}</div>
    </div>
  {:else}
    {#if bgStyle}
      <div class="absolute inset-0 -z-10" style={bgStyle} aria-hidden="true"></div>
      {#if bg.kind === 'image' && bg.image}<div class="absolute inset-0 -z-10 bg-black" style="opacity:{bg.dim / 100}" aria-hidden="true"></div>{/if}
    {/if}
    {#if cfg.layout === 'card'}
      <div class="w-full max-w-lg rounded-2xl border bg-card px-6 py-10 text-card-foreground shadow-card sm:px-10">{@render content(false)}</div>
    {:else}
      <div class="w-full max-w-xl">{@render content(light)}</div>
    {/if}
  {/if}
</main>
