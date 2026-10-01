<script lang="ts">
  import type { ResolvedBlock } from '@forum/shared';
  import { toast } from 'svelte-sonner';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import PlayIcon from 'phosphor-svelte/lib/Play';
  import UsersIcon from 'phosphor-svelte/lib/Users';
  import ChatsIcon from 'phosphor-svelte/lib/ChatsCircle';
  import NoteIcon from 'phosphor-svelte/lib/Note';
  import BroadcastIcon from 'phosphor-svelte/lib/Broadcast';
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDown';
  import ChatTextIcon from 'phosphor-svelte/lib/ChatText';
  import XIcon from 'phosphor-svelte/lib/X';
  import { buttonVariants } from '$lib/components/ui/button';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import CustomHtml from '$lib/components/CustomHtml.svelte';
  import BrandMark from '$lib/components/layout/BrandMark.svelte';
  import { formatNumber } from '$lib/format';
  import { profileUrl } from '$lib/viewer';
  import { reveal } from '$lib/reveal';
  import { cn } from '$lib/utils';
  import Countdown from './Countdown.svelte';
  import NavbarBlock from './NavbarBlock.svelte';
  import FooterBlock from './FooterBlock.svelte';
  import GalleryCarousel from './GalleryCarousel.svelte';
  import BrandIcon from '$lib/components/BrandIcon.svelte';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import QuotesIcon from 'phosphor-svelte/lib/Quotes';
  import CountUp from './CountUp.svelte';
  import { t } from '$lib/i18n.svelte';

  let { block: b, editing = false }: { block: ResolvedBlock; editing?: boolean } = $props();

  // Koyu zeminli bölümlerde yazılar beyaz
  const heroDark = $derived(b.type === 'hero' && (b.background === 'none' || b.background === 'dark' || b.background === 'accent' || b.background === 'image' || !!b.image));
  const onDark = $derived(heroDark || b.background === 'accent' || b.background === 'dark' || b.background === 'image');
  const full = $derived(b.width === 'full');
  const pad = $derived({ none: 'py-0', sm: 'py-6', md: 'py-10 sm:py-14', lg: 'py-16 sm:py-24' }[b.spacing]);
  const boxed = $derived(b.background !== 'none' || b.type === 'hero');
  const bgImage = $derived(b.type === 'hero' ? b.image || (b.background === 'image' ? b.bgImage : '') : b.background === 'image' ? b.bgImage : '');

  const btnClass = (style: string) =>
    cn(
      buttonVariants({ variant: style === 'primary' ? 'default' : style === 'outline' ? 'outline' : 'ghost', size: 'lg' }),
      'h-11 px-6 text-[15px]',
      onDark && style === 'outline' && 'border-white/40 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white',
      onDark && style === 'ghost' && 'text-white hover:bg-white/10 hover:text-white',
      onDark && style === 'primary' && b.background === 'accent' && 'bg-white text-zinc-900 hover:bg-white/90',
    );

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('Adres kopyalandı.'));
    } catch {
      toast.error(t('Kopyalanamadı.'));
    }
  }

  let lightbox = $state<string | null>(null);
  // Öğe bazında kaydırma animasyonu (blok ayarındaki türle)
  const rv = (delay: number) => (b.animation === 'none' ? (false as const) : { delay, type: b.animation });
  const heroH = $derived(b.type === 'hero' ? { sm: 'min-h-72', md: 'min-h-[26rem]', lg: 'min-h-[36rem]', screen: 'min-h-[calc(100svh-4rem)]' }[b.height] : '');
  const STATUS = { online: { l: 'Çevrimiçi', c: 'bg-success' }, maintenance: { l: 'Bakımda', c: 'bg-warning' }, soon: { l: 'Yakında', c: 'bg-primary' }, none: null } as const;
</script>

{#snippet heading(title: string, sub?: string)}
  {#if title || sub}
    <header class={cn('mb-8 grid gap-2', b.align === 'center' && 'justify-items-center text-center')}>
      {#if title}<h2 class="text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">{title}</h2>{/if}
      {#if sub}<p class={cn('max-w-2xl text-pretty', onDark ? 'text-white/75' : 'text-muted-foreground')}>{sub}</p>{/if}
    </header>
  {/if}
{/snippet}

{#snippet buttons(list: Array<{ label: string; url: string; style: string; newTab: boolean }>)}
  {#if list.length}
    <div class={cn('flex flex-wrap gap-3', b.align === 'center' && 'justify-center')}>
      {#each list as btn, i (i)}
        <a href={btn.url} class={btnClass(btn.style)} target={btn.newTab ? '_blank' : undefined} rel={btn.newTab ? 'noopener' : undefined}>{btn.label}{#if btn.style === 'primary'}<ArrowRightIcon weight="bold" />{/if}</a>
      {/each}
    </div>
  {/if}
{/snippet}

{#if b.type === 'navbar'}
  <NavbarBlock block={b} {editing} />
{:else if b.type === 'footer'}
  <FooterBlock block={b} />
{:else}
<section
  id={b.anchor || undefined}
  data-part="block-{b.type}"
  class={cn(
    'relative isolate scroll-mt-24 overflow-hidden',
    full && !editing && 'builder-bleed',
    !full && boxed && 'rounded-2xl',
    !full && b.width === 'narrow' && !boxed && 'mx-auto w-full max-w-3xl',
    b.background === 'muted' && 'bg-muted/60',
    b.background === 'card' && 'border bg-card',
    b.background === 'card' && full && 'border-x-0',
    b.background === 'accent' && 'bg-[linear-gradient(120deg,color-mix(in_oklch,var(--primary)_80%,black),var(--primary))] text-white',
    b.background === 'dark' && 'bg-zinc-950 text-white',
    onDark && 'text-white',
    b.type === 'hero' && ['flex items-center', heroH],
  )}
>
  <!-- Arka plan -->
  {#if bgImage}
    <div class="absolute inset-0 -z-20 bg-cover bg-center" style="background-image:url('{bgImage}')"></div>
    <div class="absolute inset-0 -z-10 bg-black" style="opacity:{(b.type === 'hero' ? b.overlay : 55) / 100}"></div>
  {:else if b.type === 'hero' && (b.background === 'none' || b.background === 'image')}
    <div class="forum-banner-pattern absolute inset-0 -z-10" aria-hidden="true"></div>
  {/if}

  <div
    class={cn(
      'relative w-full',
      (full || boxed) && pad,
      full ? 'mx-auto max-w-7xl px-4 sm:px-6' : boxed && 'px-5 sm:px-10',
      b.width === 'narrow' && (full || boxed) && 'mx-auto max-w-3xl',
      !full && !boxed && b.spacing !== 'none' && 'py-2',
      b.align === 'center' && 'text-center',
    )}
    use:reveal={b.animation === 'none' ? false : { type: b.animation }}
  >
    {#if b.type === 'hero'}
      <div class={cn('grid max-w-3xl gap-5', b.align === 'center' && 'mx-auto justify-items-center')}>
        {#if b.showLogo}<div class="animate-rise"><BrandMark size={64} nameClass="text-white drop-shadow-lg" /></div>{/if}
        {#if b.eyebrow}<span class="w-fit animate-rise rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-bold tracking-wider uppercase backdrop-blur" style="--i:1">{b.eyebrow}</span>{/if}
        {#if b.title}<h1 class="animate-rise text-4xl leading-[1.05] font-black tracking-tight text-balance drop-shadow-sm sm:text-6xl" style="--i:2">{b.title}</h1>{/if}
        {#if b.text}<p class="max-w-2xl animate-rise text-base leading-relaxed text-pretty text-white/85 sm:text-lg" style="--i:3">{b.text}</p>{/if}
        <div class="mt-2 animate-rise" style="--i:4">{@render buttons(b.buttons)}</div>
      </div>
    {:else if b.type === 'text'}
      {@render heading(b.title)}
      <div class={cn('prose-forum text-[15px]', b.align === 'center' && 'mx-auto max-w-3xl', onDark && '[&_a]:text-white [&_a]:underline')}>{@html b.html ?? ''}</div>
    {:else if b.type === 'features'}
      {@render heading(b.title, b.subtitle)}
      <div class={cn('grid gap-4 sm:grid-cols-2', { 2: '', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }[b.columns])}>
        {#each b.items as it, i (i)}
          {@const icon = b.itemIcons?.[i]}
          <svelte:element
            this={it.url ? 'a' : 'div'}
            href={it.url || undefined}
            class={cn(
              'group grid content-start gap-3 rounded-xl border p-5 text-left transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lift',
              onDark ? 'border-white/15 bg-white/5 hover:border-white/30' : 'bg-card hover:border-primary/40',
            )}
            use:reveal={rv(i * 70)}
          >
            {#if icon}
              <span class={cn('flex size-11 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110', onDark ? 'bg-white/10 text-white' : 'bg-primary-soft text-primary')}><NodeIcon nodes={icon} size={24} /></span>
            {:else if it.icon}
              <span class="text-3xl leading-none">{it.icon}</span>
            {/if}
            {#if it.title}<h3 class="text-base font-bold">{it.title}</h3>{/if}
            {#if it.text}<p class={cn('text-sm leading-relaxed', onDark ? 'text-white/75' : 'text-muted-foreground')}>{it.text}</p>{/if}
            {#if it.url}<span class={cn('inline-flex items-center gap-1 text-sm font-semibold', onDark ? 'text-white' : 'text-highlight')}>{t('Devamı')}<ArrowRightIcon class="size-3.5 transition-transform group-hover:translate-x-1" /></span>{/if}
          </svelte:element>
        {/each}
      </div>
    {:else if b.type === 'image'}
      {#if b.url}
        <figure class="grid gap-2">
          <svelte:element this={b.link ? 'a' : 'div'} href={b.link || undefined} class="block overflow-hidden {b.rounded ? 'rounded-xl' : ''}">
            <img src={b.url} alt={b.alt} class="w-full object-cover transition-transform duration-700 hover:scale-[1.02]" loading="lazy" />
          </svelte:element>
          {#if b.caption}<figcaption class={cn('text-sm', onDark ? 'text-white/70' : 'text-muted-foreground')}>{b.caption}</figcaption>{/if}
        </figure>
      {:else if editing}<p class="rounded-xl border-2 border-dashed py-12 text-center text-sm text-muted-foreground">{t('Görsel seçilmedi')}</p>{/if}
    {:else if b.type === 'gallery'}
      {@render heading(b.title)}
      {@const imgs = b.images.filter((g) => g.url)}
      {#if b.layout === 'carousel' && imgs.length}
        <GalleryCarousel images={imgs} autoplay={b.autoplay && !editing} onopen={(u) => (lightbox = u)} />
      {:else if b.layout === 'masonry' && imgs.length}
        <div class={cn('columns-2 gap-3', { 2: '', 3: 'md:columns-3', 4: 'md:columns-4', 5: 'md:columns-5' }[b.columns])}>
          {#each imgs as g, i (i)}
            <button type="button" class="group relative mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl bg-muted" onclick={() => (lightbox = g.url)} use:reveal={rv(i * 50)}>
              <img src={g.url} alt={g.caption} class="w-full transition-transform duration-500 group-hover:scale-105" loading="lazy" />
              {#if g.caption}<span class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-left text-xs font-semibold text-white">{g.caption}</span>{/if}
            </button>
          {/each}
        </div>
      {:else}
      <div class={cn('grid grid-cols-2 gap-3', { 2: '', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-5' }[b.columns])}>
        {#each imgs as g, i (i)}
          <button type="button" class="group relative aspect-[4/3] overflow-hidden rounded-xl bg-muted" onclick={() => (lightbox = g.url)} use:reveal={rv(i * 50)}>
            <img src={g.url} alt={g.caption} class="size-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
            {#if g.caption}<span class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-left text-xs font-semibold text-white">{g.caption}</span>{/if}
          </button>
        {:else}
          {#if editing}<p class="col-span-full rounded-xl border-2 border-dashed py-12 text-center text-sm text-muted-foreground">{t('Görsel eklenmedi')}</p>{/if}
        {/each}
      </div>
      {/if}
    {:else if b.type === 'split'}
      <div class="grid items-center gap-8 text-left md:grid-cols-2 md:gap-14">
        <div class={cn('overflow-hidden rounded-2xl', b.imageSide === 'left' && 'md:order-first', b.imageSide === 'right' && 'md:order-last')} use:reveal={rv(80)}>
          {#if b.image}<img src={b.image} alt="" class="aspect-[4/3] w-full object-cover shadow-lift" loading="lazy" />{:else}<div class="forum-banner-pattern relative aspect-[4/3] w-full"></div>{/if}
        </div>
        <div class="grid content-center gap-4">
          {#if b.eyebrow}<span class={cn('text-xs font-bold tracking-wider uppercase', onDark ? 'text-white/70' : 'text-highlight')}>{b.eyebrow}</span>{/if}
          {#if b.title}<h2 class="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{b.title}</h2>{/if}
          {#if b.html}<div class={cn('prose-forum text-[15.5px]', onDark && '[&_a]:text-white [&_a]:underline')}>{@html b.html}</div>{/if}
          <div class="mt-1">{@render buttons(b.buttons)}</div>
        </div>
      </div>
    {:else if b.type === 'testimonials'}
      {@render heading(b.title)}
      <div class="grid gap-4 text-left md:grid-cols-2 lg:grid-cols-3">
        {#each b.items as it, i (i)}
          <figure class={cn('grid content-between gap-5 rounded-2xl border p-6', onDark ? 'border-white/15 bg-white/5' : 'bg-card')} use:reveal={rv(i * 70)}>
            <blockquote class="grid gap-3">
              <QuotesIcon class={cn('size-7', onDark ? 'text-white/50' : 'text-primary')} weight="fill" />
              <p class="text-[15px] leading-relaxed">{it.quote}</p>
            </blockquote>
            <figcaption class="flex items-center gap-3">
              {#if it.avatar}<img src={it.avatar} alt="" class="size-10 rounded-full object-cover" />{:else}<span class="flex size-10 items-center justify-center rounded-full bg-primary-soft font-bold text-primary">{it.name.charAt(0) || '?'}</span>{/if}
              <span class="grid leading-tight"><b class="text-sm">{it.name}</b>{#if it.role}<span class={cn('text-xs', onDark ? 'text-white/60' : 'text-muted-foreground')}>{it.role}</span>{/if}</span>
            </figcaption>
          </figure>
        {/each}
      </div>
    {:else if b.type === 'pricing'}
      {@render heading(b.title, b.subtitle)}
      <div class={cn('mx-auto grid items-stretch gap-4 text-left sm:grid-cols-2', b.plans.length >= 3 && 'lg:grid-cols-3', b.plans.length >= 4 && 'xl:grid-cols-4', b.plans.length === 1 && 'max-w-sm sm:grid-cols-1')}>
        {#each b.plans as pl, i (i)}
          <div
            class={cn(
              'relative grid content-start gap-4 rounded-2xl border p-6 transition-transform duration-300 hover:-translate-y-1',
              onDark ? 'border-white/15 bg-white/5' : 'bg-card',
              pl.highlighted && 'border-primary shadow-lift ring-2 ring-primary/40',
            )}
            use:reveal={rv(i * 80)}
          >
            {#if pl.badge}<span class="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-primary-foreground">{pl.badge}</span>{/if}
            <div class="grid gap-1">
              <h3 class="text-lg font-bold">{pl.name}</h3>
              {#if pl.description}<p class={cn('text-sm', onDark ? 'text-white/70' : 'text-muted-foreground')}>{pl.description}</p>{/if}
            </div>
            <p class="flex items-baseline gap-1"><span class="text-4xl font-black tracking-tight">{pl.price}</span>{#if pl.period}<span class={cn('text-sm', onDark ? 'text-white/60' : 'text-muted-foreground')}>{pl.period}</span>{/if}</p>
            <ul class="grid gap-2 text-sm">
              {#each pl.features.filter(Boolean) as f, k (k)}<li class="flex gap-2"><CheckIcon class="mt-0.5 size-4 shrink-0 text-success" weight="bold" />{f}</li>{/each}
            </ul>
            {#if pl.buttonLabel && pl.buttonUrl}<a href={pl.buttonUrl} class={cn(btnClass(pl.highlighted ? 'primary' : 'outline'), 'mt-2 w-full')}>{pl.buttonLabel}</a>{/if}
          </div>
        {/each}
      </div>
    {:else if b.type === 'timeline'}
      {@render heading(b.title)}
      <ol class="relative grid max-w-3xl gap-6 border-l-2 pl-7 text-left {b.align === 'center' ? 'mx-auto' : 'ml-2'} {onDark ? 'border-white/20' : 'border-border'}">
        {#each b.items as it, i (i)}
          <li class="relative grid gap-1" use:reveal={rv(i * 60)}>
            <span class="absolute top-1 -left-[2.35rem] size-4 rounded-full border-4 border-background bg-primary"></span>
            {#if it.date}<span class={cn('w-fit rounded-md px-2 py-0.5 text-xs font-bold', onDark ? 'bg-white/10' : 'bg-primary-soft text-highlight')}>{it.date}</span>{/if}
            {#if it.title}<h3 class="text-lg font-bold">{it.title}</h3>{/if}
            {#if it.text}<p class={cn('text-sm leading-relaxed', onDark ? 'text-white/75' : 'text-muted-foreground')}>{it.text}</p>{/if}
          </li>
        {/each}
      </ol>
    {:else if b.type === 'social'}
      {@render heading(b.title, b.text)}
      <div class={cn('flex flex-wrap gap-3', b.align === 'center' && 'justify-center')}>
        {#each b.links as l, i (i)}
          <a href={l.url} target="_blank" rel="noopener" class={cn('group inline-flex items-center gap-3 rounded-xl border py-2 pr-5 pl-2 font-bold transition-[transform,border-color] duration-200 hover:-translate-y-0.5', onDark ? 'border-white/15 bg-white/5 hover:border-white/35' : 'bg-card hover:border-primary/40')} use:reveal={rv(i * 50)}>
            <BrandIcon platform={l.platform} size={18} badge />{l.label || l.platform}
          </a>
        {/each}
      </div>
    {:else if b.type === 'logos'}
      {@render heading(b.title)}
      <div class="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
        {#each b.items.filter((x) => x.image) as lg, i (i)}
          <svelte:element this={lg.url ? 'a' : 'span'} href={lg.url || undefined} target={lg.url ? '_blank' : undefined} rel={lg.url ? 'noopener' : undefined} title={lg.name} class="block" use:reveal={rv(i * 40)}>
            <img src={lg.image} alt={lg.name} class={cn('h-12 w-auto max-w-40 object-contain transition-[filter,opacity] duration-300', b.grayscale && 'opacity-70 grayscale hover:opacity-100 hover:grayscale-0')} loading="lazy" />
          </svelte:element>
        {:else}
          {#if editing}<p class="rounded-xl border-2 border-dashed px-8 py-8 text-sm text-muted-foreground">{t('Logo eklenmedi')}</p>{/if}
        {/each}
      </div>
    {:else if b.type === 'video'}
      {@render heading(b.title)}
      {#if b.html}<div class="prose-forum mx-auto max-w-4xl">{@html b.html}</div>{:else if editing}<p class="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-12 text-sm text-muted-foreground"><PlayIcon />{t('Video bağlantısı ekleyin')}</p>{/if}
    {:else if b.type === 'stats'}
      {@render heading(b.title)}
      {@const st = b.stats}
      {@const all = [
        { k: 'members', l: t('Üye'), v: st?.members ?? 0, i: UsersIcon },
        { k: 'topics', l: t('Konu'), v: st?.topics ?? 0, i: ChatsIcon },
        { k: 'posts', l: t('Mesaj'), v: st?.posts ?? 0, i: NoteIcon },
        { k: 'online', l: t('Çevrimiçi'), v: (b.onlineSummary?.total ?? 0) + (b.onlineSummary?.guests ?? 0), i: BroadcastIcon },
      ].filter((x) => b.show.includes(x.k as never))}
      <div class={cn('grid grid-cols-2 gap-3', all.length >= 4 ? 'md:grid-cols-4' : all.length === 3 ? 'md:grid-cols-3' : '')}>
        {#each all as s, i (s.k)}
          <div class={cn('grid justify-items-center gap-1 rounded-xl border px-4 py-6 text-center', onDark ? 'border-white/15 bg-white/5' : 'bg-card')} use:reveal={rv(i * 80)}>
            <s.i class={cn('size-6', onDark ? 'text-white/80' : 'text-primary')} weight="duotone" />
            <span class="text-3xl font-black sm:text-4xl"><CountUp value={s.v} /></span>
            <span class={cn('text-sm font-medium', onDark ? 'text-white/70' : 'text-muted-foreground')}>{s.l}</span>
          </div>
        {/each}
      </div>
    {:else if b.type === 'latest'}
      {@render heading(b.title)}
      <div class="grid gap-3 text-left md:grid-cols-2 xl:grid-cols-3">
        {#each b.topics ?? [] as t, i (t.topicId)}
          <a href="/t/{t.topicId}/{t.slug}" class={cn('group grid gap-3 rounded-xl border p-4 transition-[border-color,transform] duration-300 hover:-translate-y-0.5', onDark ? 'border-white/15 bg-white/5 hover:border-white/30' : 'bg-card hover:border-primary/40')} use:reveal={rv(i * 60)}>
            <span class={cn('w-fit rounded-md px-2 py-0.5 text-[11px] font-bold', onDark ? 'bg-white/10' : 'bg-primary-soft text-highlight')}>{t.board.name}</span>
            <span class="line-clamp-2 font-bold leading-snug group-hover:underline">{t.title}</span>
            {#if t.excerpt}<span class={cn('line-clamp-2 text-sm', onDark ? 'text-white/70' : 'text-muted-foreground')}>{t.excerpt}</span>{/if}
            <span class={cn('mt-auto flex items-center gap-2 text-xs', onDark ? 'text-white/70' : 'text-muted-foreground')}>
              <UserAvatar user={t.author ?? { displayName: t.authorName, avatarUrl: null }} size={22} />
              <span class="truncate">{t.author?.displayName ?? t.authorName}</span> · <TimeAgo ms={t.at} />
              <span class="ml-auto inline-flex items-center gap-1"><ChatTextIcon class="size-3.5" />{formatNumber(t.replyCount)}</span>
            </span>
          </a>
        {:else}
          <p class="col-span-full text-sm text-muted-foreground">{t('Henüz konu yok.')}</p>
        {/each}
      </div>
    {:else if b.type === 'boards'}
      {@render heading(b.title)}
      <div class="grid gap-5 text-left">
        {#each b.categories ?? [] as c (c.id)}
          <div class="grid gap-2">
            <h3 class={cn('text-xs font-bold tracking-wider uppercase', onDark ? 'text-white/70' : 'text-muted-foreground')}>{c.name}</h3>
            <div class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {#each c.boards as bd (bd.id)}
                <a href="/f/{bd.id}/{bd.slug}" class={cn('group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors', onDark ? 'border-white/15 bg-white/5 hover:border-white/30' : 'bg-card hover:border-primary/40')}>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-bold group-hover:underline">{bd.name}</span>
                    <span class={cn('block truncate text-xs', onDark ? 'text-white/65' : 'text-muted-foreground')}>{t('{topics} konu · {posts} mesaj', { topics: formatNumber(bd.topicCount), posts: formatNumber(bd.postCount) })}</span>
                  </span>
                  <ArrowRightIcon class="size-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-1" />
                </a>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else if b.type === 'server'}
      {@const status = STATUS[b.status]}
      <div class={cn('grid overflow-hidden rounded-2xl border text-left md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]', onDark ? 'border-white/15 bg-white/5' : 'bg-card shadow-card')} data-part="server-card">
        <div class="relative min-h-44 bg-cover bg-center" style={b.image ? `background-image:url('${b.image}')` : ''}>
          {#if !b.image}<div class="forum-banner-pattern absolute inset-0"></div>{/if}
          {#if status}
            <span class="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">
              <span class="relative flex size-2"><span class="absolute inline-flex size-full animate-ping rounded-full opacity-60 {status.c}"></span><span class="relative inline-flex size-2 rounded-full {status.c}"></span></span>{t(status.l)}
            </span>
          {/if}
        </div>
        <div class="grid content-center gap-4 p-5 sm:p-7">
          <div class="grid gap-1.5">
            <h3 class="text-2xl font-extrabold tracking-tight">{b.name}</h3>
            {#if b.tags.length}<div class="flex flex-wrap gap-1.5">{#each b.tags as tg (tg)}<span class={cn('rounded-md px-2 py-0.5 text-xs font-semibold', onDark ? 'bg-white/10' : 'bg-muted')}>{tg}</span>{/each}</div>{/if}
          </div>
          {#if b.description}<p class={cn('text-sm leading-relaxed', onDark ? 'text-white/75' : 'text-muted-foreground')}>{b.description}</p>{/if}
          <div class="flex flex-wrap items-center gap-2">
            {#if b.address}
              <button type="button" onclick={() => copy(b.address)} class={cn('inline-flex h-11 items-center gap-2 rounded-md border px-4 font-mono text-sm font-bold transition-colors', onDark ? 'border-white/25 bg-black/30 hover:bg-black/50' : 'bg-muted/60 hover:bg-muted')} title={t('Kopyala')}>
                {b.address}<CopyIcon class="size-4 opacity-70" />
              </button>
            {/if}
            {#if b.connectUrl}<a href={b.connectUrl} class={btnClass('primary')}><PlayIcon weight="fill" />{t('Bağlan')}</a>{/if}
            {#if b.players}<span class={cn('ml-auto inline-flex items-center gap-1.5 text-sm font-semibold', onDark ? 'text-white/80' : 'text-muted-foreground')}><UsersIcon class="size-4" />{b.players}</span>{/if}
          </div>
        </div>
      </div>
    {:else if b.type === 'team'}
      {@render heading(b.title || b.group?.name || '')}
      <div class="flex flex-wrap justify-center gap-4">
        {#each b.members ?? [] as m, i (m.id)}
          <a href={profileUrl(m)} class={cn('group grid w-32 justify-items-center gap-2 rounded-xl border px-3 py-4 text-center transition-transform duration-300 hover:-translate-y-1', onDark ? 'border-white/15 bg-white/5' : 'bg-card')} use:reveal={rv(i * 50)}>
            <UserAvatar user={m} size={64} />
            <UserName user={m} class="max-w-full truncate text-sm font-bold" />
            {#if m.customTitle || m.primaryGroup}<span class={cn('max-w-full truncate text-xs', onDark ? 'text-white/65' : 'text-muted-foreground')}>{m.customTitle ?? m.primaryGroup?.name}</span>{/if}
          </a>
        {:else}
          {#if editing}<p class="text-sm text-muted-foreground">{t('Bir grup seçin.')}</p>{/if}
        {/each}
      </div>
    {:else if b.type === 'cta'}
      <div class={cn('grid gap-5', b.align === 'center' ? 'justify-items-center' : 'items-center md:grid-cols-[1fr_auto]')}>
        <div class="grid gap-2">
          {#if b.title}<h2 class="text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">{b.title}</h2>{/if}
          {#if b.text}<p class={cn('max-w-2xl text-pretty', onDark ? 'text-white/80' : 'text-muted-foreground')}>{b.text}</p>{/if}
        </div>
        {@render buttons(b.buttons)}
      </div>
    {:else if b.type === 'faq'}
      {@render heading(b.title)}
      <div class="mx-auto grid max-w-3xl gap-2 text-left">
        {#each b.items as it, i (i)}
          <details class={cn('group rounded-xl border px-5 py-1 transition-colors open:pb-4', onDark ? 'border-white/15 bg-white/5' : 'bg-card')}>
            <summary class="flex cursor-pointer list-none items-center gap-3 py-3 font-bold [&::-webkit-details-marker]:hidden">
              <span class="flex-1">{it.q}</span><CaretDownIcon class="size-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div class="prose-forum text-sm">{@html b.faqHtml?.[i] ?? ''}</div>
          </details>
        {/each}
      </div>
    {:else if b.type === 'countdown'}
      <div class="grid justify-items-center gap-5 text-center">
        {#if b.title}<h2 class="text-2xl font-extrabold tracking-tight sm:text-3xl">{b.title}</h2>{/if}
        {#if b.text}<p class={cn('max-w-2xl', onDark ? 'text-white/75' : 'text-muted-foreground')}>{b.text}</p>{/if}
        <Countdown target={b.target} doneText={b.doneText} />
      </div>
    {:else if b.type === 'html'}
      {#if editing && !b.html.trim()}
        <div class="rounded-xl border-2 border-dashed bg-muted/30 p-4 text-left font-mono text-xs text-muted-foreground">&lt;/&gt; {t('Özel HTML — yayındaki sayfada çalışır ({n} karakter)', { n: b.html.length })}</div>
      {:else}
        <CustomHtml html={b.html} part="block-html" />
      {/if}
    {:else if b.type === 'spacer'}
      <div class={cn({ sm: 'h-4', md: 'h-10', lg: 'h-20' }[b.size], 'flex items-center')}>{#if b.line}<hr class="w-full border-current/15" />{/if}</div>
    {/if}
  </div>
</section>
{/if}

{#if lightbox}
  <!-- Galeri büyütme -->
  <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur animate-in fade-in" role="dialog" aria-modal="true" tabindex="-1" onclick={() => (lightbox = null)} onkeydown={(e) => e.key === 'Escape' && (lightbox = null)}>
    <img src={lightbox} alt="" class="max-h-full max-w-full rounded-lg shadow-2xl animate-in zoom-in-95" />
    <button type="button" class="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label={t('Kapat')}><XIcon class="size-5" /></button>
  </div>
{/if}
