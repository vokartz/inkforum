<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import BrandMark from './layout/BrandMark.svelte';
  import ThemeToggle from './layout/ThemeToggle.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    title: string;
    description?: string;
    wide?: boolean;
    showcase?: boolean;
    children: Snippet;
    footer?: Snippet;
  }
  let { title, description, wide = false, showcase = false, children, footer }: Props = $props();

  const s = $derived(page.data.viewer?.settings ?? {});
  const forumName = $derived(String(s['general.forumName'] ?? 'Forum'));
  const image = $derived(s['appearance.authImageUrl'] as string | null | undefined);
  const layout = $derived(String(s['appearance.authLayout'] ?? 'split') as 'split' | 'centered' | 'cover');
  const side = $derived(s['appearance.authImageSide'] === 'right' ? 'right' : 'left');
  const headline = $derived(String(s['appearance.authHeadline'] ?? '').trim() || t('{name} topluluğuna hoş geldin', { name: forumName }));
  const blurb = $derived(String(s['appearance.authText'] ?? '').trim() || String(s['general.forumDescription'] ?? '').trim());
  const plainBg =
    'background: radial-gradient(70% 60% at 90% 0%, color-mix(in oklab, var(--primary) 30%, transparent), transparent 70%), radial-gradient(60% 50% at 0% 100%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%), color-mix(in oklab, var(--primary) 10%, #0d0f13)';
</script>

<svelte:head><title>{title} · {forumName}</title></svelte:head>

<!-- Görsel alanı: yüklenen görsel ya da sade koyu zemin; logo, başlık ve kısa metin -->
{#snippet visual(cls: string, content = true)}
  <aside class={cn('relative isolate overflow-hidden text-white', cls)} data-part="auth-visual">
    {#if image}
      <img src={image} alt="" class="absolute inset-0 -z-20 size-full object-cover" />
      <div class="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/25 to-black/40"></div>
    {:else}
      <div class="absolute inset-0 -z-20" style={plainBg}></div>
    {/if}
    {#if content}
      <div class="flex h-full flex-col justify-between gap-10 p-10 xl:p-14">
        <a href="/" class="block w-fit rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-white/50"><BrandMark size={44} surface="dark" nameClass="text-xl text-white" /></a>
        <div class="grid max-w-lg gap-3">
          <p class="text-3xl leading-tight font-extrabold tracking-tight text-balance xl:text-4xl" data-part="auth-headline">{headline}</p>
          {#if blurb}<p class="text-base leading-relaxed text-white/75">{blurb}</p>{/if}
        </div>
      </div>
    {/if}
  </aside>
{/snippet}

{#snippet formBody(cardMode: boolean)}
  <div class={cn('grid w-full gap-7', wide ? 'max-w-xl' : 'max-w-md')}>
    <header class="grid gap-2">
      <a href="/" class={cn('mb-3 w-fit', !cardMode && layout === 'split' && 'lg:hidden')}><BrandMark size={38} /></a>
      <h1 class="text-3xl font-extrabold tracking-tight">{title}</h1>
      {#if description}<p class="text-muted-foreground">{description}</p>{/if}
    </header>
    {@render children()}
    {#if footer}
      <footer class="border-t pt-6 text-center text-sm text-muted-foreground">{@render footer()}</footer>
    {/if}
  </div>
{/snippet}

{#snippet topBar(cls = '')}
  <div class={cn('flex items-center justify-between px-6 py-5 sm:px-10', cls)}>
    <a href="/" class="inline-flex items-center gap-2 text-sm font-medium opacity-80 transition-opacity hover:opacity-100">
      <ArrowLeftIcon class="size-4" weight="bold" />{t('Foruma dön')}
    </a>
    <ThemeToggle loggedIn={false} timezone="Europe/Istanbul" />
  </div>
{/snippet}

{#snippet legal(cls = '')}
  <p class={cn('px-6 pb-5 text-center text-xs sm:px-10', cls)}>
    <a href="/policies/terms" class="hover:underline">{t('Kullanım koşulları')}</a> · <a href="/policies/privacy" class="hover:underline">{t('Gizlilik')}</a> ·
    <a href="/cookies" class="hover:underline">{t('Çerezler')}</a>
  </p>
{/snippet}

{#if showcase && layout === 'centered'}
  <!-- Ortada kart: görsel (varsa) karartılmış arka plan -->
  <div class="relative isolate flex min-h-dvh flex-col" data-part="auth-page" data-layout="centered">
    {#if image}
      <img src={image} alt="" class="absolute inset-0 -z-20 size-full object-cover" />
      <div class="absolute inset-0 -z-10 bg-background/80 backdrop-blur-sm"></div>
    {:else}
      <div class="absolute inset-0 -z-10 bg-muted/40"></div>
    {/if}
    {@render topBar('text-muted-foreground')}
    <div class="flex flex-1 items-center justify-center px-4 pb-10">
      <div class="w-full rounded-3xl border bg-card p-7 shadow-lift animate-rise sm:p-10 {wide ? 'max-w-[38rem]' : 'max-w-[30rem]'}">
        {@render formBody(true)}
      </div>
    </div>
    {@render legal('text-muted-foreground')}
  </div>
{:else if showcase && layout === 'cover'}
  <!-- Tam ekran: görsel ya da koyu zemin üzerinde, sağda kart -->
  <div class="relative isolate grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(30rem,36rem)]" data-part="auth-page" data-layout="cover">
    {@render visual('absolute inset-0 -z-10', false)}
    <div class="hidden flex-col justify-between p-10 text-white lg:flex xl:p-14">
      <a href="/" class="block w-fit"><BrandMark size={44} surface="dark" nameClass="text-xl text-white" /></a>
      <div class="grid max-w-lg gap-3">
        <p class="text-4xl leading-tight font-extrabold tracking-tight text-balance" data-part="auth-headline">{headline}</p>
        {#if blurb}<p class="text-base leading-relaxed text-white/75">{blurb}</p>{/if}
      </div>
    </div>
    <div class="flex flex-col p-3 sm:p-6">
      <main class="flex flex-1 flex-col rounded-3xl border bg-card/95 shadow-lift backdrop-blur">
        {@render topBar('text-muted-foreground')}
        <div class="flex flex-1 items-center justify-center px-6 pb-8 sm:px-10">{@render formBody(true)}</div>
        {@render legal('text-muted-foreground')}
      </main>
    </div>
  </div>
{:else if showcase}
  <!-- Bölünmüş: bir yanda görsel, diğer yanda form -->
  <div class={cn('grid min-h-dvh', side === 'right' ? 'lg:grid-cols-[minmax(28rem,1fr)_minmax(0,1.1fr)]' : 'lg:grid-cols-[minmax(0,1.1fr)_minmax(28rem,1fr)]')} data-part="auth-page" data-layout="split">
    {@render visual(cn('hidden lg:block', side === 'right' && 'lg:order-2'))}
    <main class="relative flex min-h-dvh flex-col bg-background">
      {@render topBar('text-muted-foreground')}
      <div class="flex flex-1 items-center justify-center px-6 pb-10 sm:px-10">
        <div class="contents animate-rise">{@render formBody(false)}</div>
      </div>
      {@render legal('text-muted-foreground')}
    </main>
  </div>
{:else}
  <div class="mx-auto w-full py-4 sm:py-8 {wide ? 'max-w-xl' : 'max-w-md'}">
    <div class="grid gap-6 rounded-3xl border bg-card p-6 shadow-lift animate-rise sm:p-9" data-part="auth-card">
      <header class="grid gap-1.5">
        <h1 class="text-2xl font-extrabold">{title}</h1>
        {#if description}<p class="text-sm text-muted-foreground">{description}</p>{/if}
      </header>
      {@render children()}
      {#if footer}
        <footer class="border-t pt-5 text-center text-sm text-muted-foreground">{@render footer()}</footer>
      {/if}
    </div>
  </div>
{/if}
