<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ADMIN_TOUR, WHATS_NEW, whatsNewSince, type AdminOnboarding, type WhatsNewEntry } from '@forum/shared';
  import XIcon from 'phosphor-svelte/lib/X';
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import SignpostIcon from 'phosphor-svelte/lib/Signpost';
  import SparkleIcon from 'phosphor-svelte/lib/Sparkle';
  import PaletteIcon from 'phosphor-svelte/lib/Palette';
  import ChatsIcon from 'phosphor-svelte/lib/ChatsCircle';
  import PuzzleIcon from 'phosphor-svelte/lib/PuzzlePiece';
  import ShieldIcon from 'phosphor-svelte/lib/ShieldCheck';
  import CodeIcon from 'phosphor-svelte/lib/Code';
  import SquaresIcon from 'phosphor-svelte/lib/SquaresFour';
  import BrushIcon from 'phosphor-svelte/lib/PaintBrushBroad';
  import RocketIcon from 'phosphor-svelte/lib/RocketLaunch';
  import { Button } from '$lib/components/ui/button';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n.svelte';

  let { onboarding }: { onboarding: AdminOnboarding } = $props();
  const ob = $state(untrack(() => ({ ...onboarding })));

  type Mode = 'idle' | 'welcome' | 'tour' | 'news';
  let mode = $state<Mode>('idle');
  let step = $state(0);
  let rect = $state<DOMRect | null>(null);
  let news = $state<WhatsNewEntry[]>([]);
  let card = $state<HTMLElement | null>(null);
  let cardSize = $state({ w: 360, h: 220 });

  const ICONS: Record<string, typeof SparkleIcon> = {
    'puzzle-piece': PuzzleIcon,
    code: CodeIcon,
    'squares-four': SquaresIcon,
    'paint-brush-broad': BrushIcon,
  };
  const name = $derived(page.data.viewer?.user?.displayName ?? '');
  const forumName = $derived(String(page.data.viewer?.settings['general.forumName'] ?? ''));

  async function save(body: { tour?: 'done' | 'reset'; seenVersion?: string }) {
    try {
      await api.post('/api/admin/onboarding', body);
    } catch {
    }
  }

  onMount(() => {
    if (!ob.tourDoneAt) {
      mode = 'welcome';
      return;
    }
    const pending = whatsNewSince(ob.seenVersion, ob.currentVersion);
    if (pending.length) {
      news = pending;
      mode = 'news';
    }
  });

  export function startTour() {
    mode = 'tour';
    step = 0;
    void place();
  }
  export function showNews(force = false) {
    const pending = whatsNewSince(ob.seenVersion, ob.currentVersion);
    news = pending.length ? pending : force ? WHATS_NEW.slice(0, 1) : [];
    if (news.length) mode = 'news';
  }

  async function finishTour() {
    mode = 'idle';
    rect = null;
    ob.tourDoneAt = Date.now();
    ob.seenVersion = ob.currentVersion;
    await save({ tour: 'done', seenVersion: ob.currentVersion });
  }
  async function skipWelcome() {
    await finishTour();
  }
  async function closeNews() {
    mode = 'idle';
    ob.seenVersion = ob.currentVersion;
    await save({ seenVersion: ob.currentVersion });
  }

  const current = $derived(ADMIN_TOUR[step]);

  function visible(el: Element): boolean {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  async function place() {
    const s = ADMIN_TOUR[step];
    if (!s) return;
    if (s.href && page.url.pathname !== s.href) await goto(s.href);
    await tick();
    const el = s.target ? [...document.querySelectorAll(`[data-tour="${CSS.escape(s.target)}"]`)].find(visible) : null;
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
      await new Promise((r) => requestAnimationFrame(r));
      rect = el.getBoundingClientRect();
    } else rect = null;
    await tick();
    if (card) cardSize = { w: card.offsetWidth, h: card.offsetHeight };
  }

  function go(delta: number) {
    const next = step + delta;
    if (next < 0) return;
    if (next >= ADMIN_TOUR.length) return void finishTour();
    step = next;
    void place();
  }

  $effect(() => {
    if (mode !== 'tour') return;
    const onResize = () => void place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void finishTour();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  });

  const PAD = 8;
  const hole = $derived(rect ? { x: rect.left - PAD, y: rect.top - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 } : null);
  const cardPos = $derived.by(() => {
    if (!hole || typeof window === 'undefined') return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 16;
    const { w, h } = cardSize;
    const clampY = (y: number) => Math.min(Math.max(12, y), vh - h - 12);
    const clampX = (x: number) => Math.min(Math.max(12, x), vw - w - 12);
    if (hole.x + hole.w + gap + w < vw - 12) return { left: hole.x + hole.w + gap, top: clampY(hole.y + Math.min(hole.h, 160) / 2 - 40) };
    if (hole.y + hole.h + gap + h < vh - 12) return { left: clampX(hole.x), top: hole.y + hole.h + gap };
    if (hole.y - gap - h > 12) return { left: clampX(hole.x), top: hole.y - gap - h };
    return { left: clampX(hole.x - w - gap), top: clampY(hole.y) };
  });

  const WELCOME_CARDS = [
    { icon: PaletteIcon, title: 'Görünüm', body: 'Tema seç ya da tema stüdyosunda kendi temanı oluştur; logo, menü ve ana sayfayı düzenle.' },
    { icon: ChatsIcon, title: 'Forum yapısı', body: 'Kategorileri, bölümleri, önekleri ve bölüm yetkilerini kur.' },
    { icon: PuzzleIcon, title: 'Eklentiler', body: 'Wiki, başvurular, destek ya da kendi eklentin: yeni sayfalar ve yönetim ekranları ekle.' },
    { icon: ShieldIcon, title: 'Güvenlik ve yedekler', body: 'Güvenlik duvarı, bot doğrulama, otomatik yedek ve tek tıkla güncelleme.' },
  ];
</script>

{#if mode === 'welcome'}
  <div class="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-md" transition:fade={{ duration: 150 }} data-part="admin-welcome">
    <div class="relative my-auto w-full max-w-4xl overflow-hidden rounded-3xl border bg-card shadow-2xl" in:scale={{ start: 0.96, duration: 220 }} role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div class="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_35%,transparent),transparent_70%)]"></div>
      <button type="button" class="absolute top-4 right-4 z-10 rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground" onclick={skipWelcome} aria-label={t('Kapat')}><XIcon class="size-5" /></button>
      <div class="relative px-6 pt-12 pb-8 text-center sm:px-12">
        <img src="/brand/inkforum-icon-192.png" alt="" class="mx-auto size-20 rounded-2xl shadow-lg" />
        <h1 id="welcome-title" class="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {name ? t('Hoş geldin, {name}!', { name }) : t('Hoş geldin!')}
        </h1>
        <p class="mx-auto mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
          {t('{forum} yönetim paneline hoş geldin. Birkaç dakikalık turla panelin nerede ne olduğunu gösterelim; istersen hemen başlayabilirsin.', { forum: forumName || 'InkForum' })}
        </p>
      </div>
      <div class="relative grid gap-3 px-6 sm:grid-cols-2 sm:px-12">
        {#each WELCOME_CARDS as c, i (c.title)}
          <div class="flex gap-4 rounded-2xl border bg-background/60 p-5 animate-rise" style="--i:{i}">
            <span class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><c.icon class="size-6" weight="duotone" /></span>
            <span>
              <span class="block text-base font-bold">{t(c.title)}</span>
              <span class="mt-1 block text-sm text-muted-foreground">{t(c.body)}</span>
            </span>
          </div>
        {/each}
      </div>
      <div class="relative flex flex-col-reverse items-center justify-center gap-3 px-6 pt-8 pb-10 sm:flex-row sm:px-12">
        <Button variant="ghost" size="lg" onclick={skipWelcome}>{t('Şimdilik geç')}</Button>
        <Button size="lg" class="h-12 px-8 text-base" onclick={startTour}><SignpostIcon weight="bold" />{t('Turu başlat')}<span class="text-xs font-normal opacity-80">· {t('2 dakika')}</span></Button>
      </div>
    </div>
  </div>
{/if}

{#if mode === 'tour' && current}
  <div class="fixed inset-0 z-[90]" data-part="admin-tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
    <!-- Karartma: hedefin çevresi boş bırakılır -->
    <svg class="absolute inset-0 size-full" aria-hidden="true" onclick={() => go(1)} role="presentation">
      <defs>
        <mask id="tour-hole">
          <rect width="100%" height="100%" fill="white" />
          {#if hole}<rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="12" fill="black" style="transition: all 0.25s ease" />{/if}
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="rgb(0 0 0 / 0.62)" mask="url(#tour-hole)" />
      {#if hole}<rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="12" fill="none" stroke="var(--primary)" stroke-width="2" class="animate-pulse" style="transition: all 0.25s ease" />{/if}
    </svg>

    <div
      bind:this={card}
      class="absolute w-[min(26rem,calc(100vw-1.5rem))] rounded-2xl border bg-popover p-5 text-popover-foreground shadow-2xl"
      style={cardPos ? `left:${cardPos.left}px;top:${cardPos.top}px` : 'left:50%;top:50%;transform:translate(-50%,-50%)'}
      in:scale={{ start: 0.95, duration: 160 }}
    >
      <div class="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <SignpostIcon class="size-4 text-primary" weight="fill" />{t('Tanıtım turu')}
        <span class="ml-auto tabular-nums">{step + 1} / {ADMIN_TOUR.length}</span>
      </div>
      <h2 id="tour-title" class="mt-2 text-lg font-extrabold">{t(current.title)}</h2>
      <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(current.body)}</p>
      <div class="mt-4 flex gap-1">
        {#each ADMIN_TOUR as _, i (i)}<span class="h-1 flex-1 rounded-full {i <= step ? 'bg-primary' : 'bg-muted'}"></span>{/each}
      </div>
      <div class="mt-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" onclick={finishTour}>{t('Turu bitir')}</Button>
        <span class="flex-1"></span>
        {#if step > 0}<Button variant="outline" size="sm" onclick={() => go(-1)}><ArrowLeftIcon />{t('Geri')}</Button>{/if}
        <Button size="sm" onclick={() => go(1)}>
          {#if step === ADMIN_TOUR.length - 1}<RocketIcon />{t('Bitir')}{:else}{t('İleri')}<ArrowRightIcon />{/if}
        </Button>
      </div>
    </div>
  </div>
{/if}

{#if mode === 'news' && news.length}
  <div class="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-md" transition:fade={{ duration: 150 }} data-part="admin-whats-new">
    <div class="relative my-auto w-full max-w-4xl overflow-hidden rounded-3xl border bg-card shadow-2xl" in:scale={{ start: 0.96, duration: 220 }} role="dialog" aria-modal="true" aria-labelledby="news-title">
      <div class="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--success)_30%,transparent),transparent_70%)]"></div>
      <button type="button" class="absolute top-4 right-4 z-10 rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground" onclick={closeNews} aria-label={t('Kapat')}><XIcon class="size-5" /></button>
      <div class="relative px-6 pt-10 pb-6 text-center sm:px-12">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-bold text-success"><SparkleIcon class="size-4" weight="fill" />{t('InkForum v{version} kuruldu', { version: ob.currentVersion })}</span>
        <h1 id="news-title" class="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{t('Neler yeni?')}</h1>
      </div>
      <div class="relative grid max-h-[60vh] gap-8 overflow-y-auto px-6 pb-4 sm:px-12">
        {#each news as entry (entry.version)}
          <section>
            <h2 class="mb-3 flex items-baseline gap-2 text-lg font-bold">{t(entry.title)}<span class="text-xs font-semibold text-muted-foreground">v{entry.version}</span></h2>
            <div class="grid gap-3 sm:grid-cols-2">
              {#each entry.items as item, i (item.title)}
                {@const Icon = ICONS[item.icon] ?? SparkleIcon}
                <div class="flex flex-col gap-3 rounded-2xl border bg-background/60 p-5 animate-rise" style="--i:{i}">
                  <span class="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon class="size-6" weight="duotone" /></span>
                  <span class="text-base font-bold">{t(item.title)}</span>
                  <span class="flex-1 text-sm text-muted-foreground">{t(item.body)}</span>
                  {#if item.href}
                    <Button variant="outline" size="sm" class="self-start" onclick={async () => (await closeNews(), goto(item.href!))}>{t('Göster')}<ArrowRightIcon /></Button>
                  {/if}
                </div>
              {/each}
            </div>
          </section>
        {/each}
      </div>
      <div class="relative flex flex-col-reverse items-center justify-center gap-3 px-6 pt-6 pb-8 sm:flex-row">
        <Button variant="ghost" onclick={async () => (await closeNews(), startTour())}><SignpostIcon />{t('Tanıtım turunu başlat')}</Button>
        <Button size="lg" class="px-8" onclick={closeNews}>{t('Anladım')}</Button>
      </div>
    </div>
  </div>
{/if}
