<script lang="ts">
  import { extractHeadings } from '@forum/shared';
  import { slide } from 'svelte/transition';
  import ScalesIcon from 'phosphor-svelte/lib/Scales';
  import GavelIcon from 'phosphor-svelte/lib/Gavel';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheck';
  import FileTextIcon from 'phosphor-svelte/lib/FileText';
  import CookieIcon from 'phosphor-svelte/lib/Cookie';
  import ScrollIcon from 'phosphor-svelte/lib/Scroll';
  import PrinterIcon from 'phosphor-svelte/lib/Printer';
  import ClockIcon from 'phosphor-svelte/lib/ClockCounterClockwise';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import WarningIcon from 'phosphor-svelte/lib/WarningCircle';
  import SparkleIcon from 'phosphor-svelte/lib/Sparkle';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDown';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import { Button } from '$lib/components/ui/button';
  import TableOfContents from '$lib/components/TableOfContents.svelte';
  import { formatDate } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const p = $derived(data.policy);
  const viewer = $derived(data.viewer);
  const toc = $derived(extractHeadings(p.bodyHtml));
  const outdated = $derived(!!viewer.user && !!p.accepted && p.accepted.version < p.version);
  let historyOpen = $state(false);

  const ICONS: Record<string, typeof ScalesIcon> = { rules: GavelIcon, terms: FileTextIcon, privacy: ShieldCheckIcon, cookies: CookieIcon };
  const iconOf = (key: string) => ICONS[key] ?? ScrollIcon;
  const Icon = $derived(iconOf(p.key));
</script>

<svelte:head><title>{p.title} · {viewer.settings['general.forumName']}</title></svelte:head>

<div class="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_13rem] xl:gap-8" data-part="policy-page">
  <!-- Yasal sayfalar menüsü -->
  <aside class="print:hidden" aria-label={t('Yasal sayfalar')}>
    <div class="grid gap-1 lg:sticky lg:top-24">
      <p class="mb-1 hidden items-center gap-1.5 px-2 text-xs font-bold tracking-wider text-muted-foreground uppercase lg:flex"><ScalesIcon class="size-3.5" />{t('Kurallar ve politikalar')}</p>
      <div class="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:gap-1 lg:overflow-visible lg:p-0">
        {#each data.policies as it (it.key)}
          {@const I = iconOf(it.key)}
          <a
            href="/policies/{it.key}"
            class={cn(
              'flex shrink-0 items-center gap-2.5 rounded-md border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors lg:border-transparent',
              it.key === p.key ? 'border-primary/40 bg-primary-soft font-semibold text-highlight' : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground lg:bg-transparent',
            )}
            aria-current={it.key === p.key ? 'page' : undefined}
          >
            <I class="size-4 shrink-0" weight={it.key === p.key ? 'fill' : 'regular'} />
            <span class="truncate">{it.title}</span>
          </a>
        {/each}
        <a href="/cookies" class="flex shrink-0 items-center gap-2.5 rounded-md border bg-card px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:border-transparent lg:bg-transparent">
          <CookieIcon class="size-4 shrink-0" /><span>{t('Çerez tercihleri')}</span>
        </a>
      </div>
    </div>
  </aside>

  <article class="min-w-0 animate-rise">
    <!-- Başlık alanı -->
    <header class="relative isolate overflow-hidden rounded-2xl border bg-card px-5 py-6 sm:px-8 sm:py-8" data-part="policy-hero">
      <div class="absolute -top-16 -right-10 -z-10 size-56 rounded-full bg-primary/10 blur-3xl"></div>
      <div class="flex flex-wrap items-start gap-4">
        <span class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon class="size-6" weight="duotone" /></span>
        <div class="order-last min-w-0 basis-full sm:order-none sm:basis-0 sm:flex-1">
          <h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl">{p.title}</h1>
          <div class="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
            <span class="rounded-full bg-muted px-2.5 py-1 font-semibold whitespace-nowrap">{t('Sürüm {version}', { version: p.version })}</span>
            <span class="rounded-full bg-muted px-2.5 py-1 font-semibold whitespace-nowrap">{t('Yürürlük: {date}', { date: formatDate(p.publishedAt) })}</span>
            {#if p.isRequired}<span class="rounded-full bg-primary-soft px-2.5 py-1 font-semibold whitespace-nowrap text-highlight">{t('Üyelik için onay gerekli')}</span>{/if}
          </div>
        </div>
        <div class="ml-auto flex gap-1.5 print:hidden">
          {#if viewer.isAdmin}<Button href="/admin/policies/{p.policyId}" variant="ghost" size="icon-sm" title={t('Düzenle')}><PencilIcon /></Button>{/if}
          <Button variant="ghost" size="icon-sm" onclick={() => window.print()} title={t('Yazdır')}><PrinterIcon /></Button>
        </div>
      </div>

      {#if viewer.user && p.accepted}
        <p class={cn('mt-5 flex items-center gap-2 rounded-lg px-3 py-2 text-sm', outdated ? 'bg-warning/15' : 'bg-success/10')}>
          {#if outdated}
            <WarningIcon class="size-4 shrink-0 text-warning" weight="fill" />{t('Kabul ettiğiniz sürüm {version}; bu metin güncellendi.', { version: p.accepted.version })}
          {:else}
            <CheckCircleIcon class="size-4 shrink-0 text-success" weight="fill" />{t('Bu sürümü {date} tarihinde kabul ettiniz.', { date: formatDate(p.accepted.at) })}
          {/if}
        </p>
      {/if}
      {#if p.changeNote}
        <div class="mt-4 flex gap-2.5 rounded-lg border border-dashed px-3.5 py-3 text-sm">
          <SparkleIcon class="mt-0.5 size-4 shrink-0 text-primary" weight="fill" />
          <p><b>{t('Bu sürümde değişenler:')}</b> {p.changeNote}</p>
        </div>
      {/if}
    </header>

    <!-- İçerik -->
    <div class="mt-5 rounded-2xl border bg-card px-5 py-6 sm:px-8 sm:py-8" data-part="policy-body">
      {#if toc.length}
        <details class="mb-6 rounded-lg border bg-muted/30 px-4 py-3 xl:hidden print:hidden">
          <summary class="cursor-pointer text-sm font-semibold">{t('İçindekiler')}</summary>
          <TableOfContents items={toc} title="" class="mt-3" />
        </details>
      {/if}
      <div class="prose-forum max-w-[72ch] text-[15px]">{@html p.bodyHtml}</div>
    </div>

    <!-- Sürüm geçmişi -->
    {#if p.history && p.history.length > 1}
      <section class="mt-5 rounded-2xl border bg-card print:hidden">
        <button type="button" class="flex w-full items-center gap-2 px-5 py-4 text-left text-sm font-bold sm:px-8" onclick={() => (historyOpen = !historyOpen)} aria-expanded={historyOpen}>
          <ClockIcon class="size-4 text-muted-foreground" />{t('Sürüm geçmişi')} <span class="font-normal text-muted-foreground">({p.history.length})</span>
          <CaretDownIcon class={cn('ml-auto size-4 transition-transform', historyOpen && 'rotate-180')} />
        </button>
        {#if historyOpen}
          <ol class="grid gap-0 border-t px-5 py-3 sm:px-8" transition:slide={{ duration: 200 }}>
            {#each p.history as h (h.version)}
              <li class="relative grid grid-cols-[4.5rem_1fr] gap-3 py-2.5 text-sm">
                <span class="font-bold tabular-nums">{t('Sürüm {version}', { version: h.version })}</span>
                <span class="min-w-0">
                  <span class="text-muted-foreground">{formatDate(h.publishedAt)}</span>
                  {#if h.requiresReacceptance}<span class="ml-1.5 rounded bg-primary-soft px-1.5 py-0.5 text-[11px] font-semibold text-highlight">{t('Yeniden onay istendi')}</span>{/if}
                  {#if h.changeNote}<span class="mt-0.5 block">{h.changeNote}</span>{/if}
                </span>
              </li>
            {/each}
          </ol>
        {/if}
      </section>
    {/if}
  </article>

  <!-- İçindekiler (geniş ekran) -->
  <aside class="hidden xl:block print:hidden">
    <div class="sticky top-24"><TableOfContents items={toc} /></div>
  </aside>
</div>
