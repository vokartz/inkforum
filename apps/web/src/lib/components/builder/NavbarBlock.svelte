<script lang="ts">
  import type { BuilderBlock } from '@forum/shared';
  import { page } from '$app/state';
  import { slide } from 'svelte/transition';
  import ListIcon from 'phosphor-svelte/lib/List';
  import XIcon from 'phosphor-svelte/lib/X';
  import SignInIcon from 'phosphor-svelte/lib/SignIn';
  import { buttonVariants } from '$lib/components/ui/button';
  import BrandMark from '$lib/components/layout/BrandMark.svelte';
  import UserMenu from '$lib/components/layout/UserMenu.svelte';
  import { loginHref } from '$lib/nav-auth';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  type Navbar = Extract<BuilderBlock, { type: 'navbar' }>;
  let { block: b, editing = false }: { block: Navbar; editing?: boolean } = $props();

  const viewer = $derived(page.data.viewer);
  let scrolled = $state(false);
  let open = $state(false);
  const overlay = $derived(b.transparent && !editing);
  // Şeffaf menü kaydırılana kadar kapağın üzerinde beyaz yazıyla durur
  const light = $derived((overlay && !scrolled) || b.background === 'dark' || b.background === 'accent' || (editing && b.transparent));
</script>

<svelte:window onscroll={() => (scrolled = window.scrollY > 24)} />

<header
  id={b.anchor || undefined}
  data-part="block-navbar"
  class={cn(
    'z-50 w-full transition-[background-color,box-shadow,border-color] duration-300',
    overlay ? 'fixed inset-x-0 top-0' : b.sticky && !editing ? 'sticky top-0' : 'relative',
    overlay && !scrolled
      ? 'border-b border-transparent bg-transparent'
      : b.background === 'dark'
        ? 'bg-zinc-950 text-white'
        : b.background === 'accent'
          ? 'bg-primary text-primary-foreground'
          : editing && b.transparent
            ? 'bg-zinc-900 text-white'
            : 'border-b bg-background/85 backdrop-blur-xl',
    scrolled && !editing && 'shadow-sm',
    light && 'text-white',
  )}
>
  <div class="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
    <a href="/" class="flex min-w-0 shrink-0 items-center gap-2.5" aria-label={t('Ana sayfa')}>
      {#if b.showLogo}<BrandMark size={34} withName={!b.brand} nameClass={light ? 'text-white' : ''} />{/if}
      {#if b.brand}<span class="truncate text-lg font-black tracking-tight">{b.brand}</span>{/if}
    </a>
    <nav class="ml-4 hidden flex-1 items-center gap-1 md:flex" aria-label={t('Menü')}>
      {#each b.links as l, i (i)}
        <a href={l.url} class={cn('rounded-md px-3 py-2 text-sm font-semibold transition-colors', light ? 'text-white/85 hover:bg-white/10 hover:text-white' : 'text-foreground/75 hover:bg-accent hover:text-foreground')}>{l.label}</a>
      {/each}
    </nav>
    <div class="ml-auto flex items-center gap-2">
      {#each b.buttons as btn, i (i)}
        <a
          href={btn.url}
          target={btn.newTab ? '_blank' : undefined}
          rel={btn.newTab ? 'noopener' : undefined}
          class={cn(buttonVariants({ variant: btn.style === 'primary' ? 'default' : btn.style === 'outline' ? 'outline' : 'ghost' }), 'hidden sm:inline-flex', light && btn.style !== 'primary' && 'border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white')}>{btn.label}</a
        >
      {/each}
      {#if b.showAuth && viewer}
        {#if viewer.user}
          <UserMenu {viewer} />
        {:else}
          <a href={loginHref()} class={cn(buttonVariants({ variant: 'ghost' }), 'hidden sm:inline-flex', light && 'text-white hover:bg-white/10 hover:text-white')}><SignInIcon />{t('Giriş yap')}</a>
          {#if viewer.settings['registration.mode'] !== 'closed'}<a href="/register" class={buttonVariants()}>{t('Kayıt ol')}</a>{/if}
        {/if}
      {/if}
      {#if b.links.length}
        <button type="button" class={cn('flex size-10 items-center justify-center rounded-md md:hidden', light ? 'hover:bg-white/10' : 'hover:bg-accent')} onclick={() => (open = !open)} aria-label={t('Menü')} aria-expanded={open}>
          {#if open}<XIcon class="size-5" />{:else}<ListIcon class="size-5" />{/if}
        </button>
      {/if}
    </div>
  </div>
  {#if open}
    <nav class="grid gap-1 border-t bg-background px-4 py-3 text-foreground md:hidden" transition:slide={{ duration: 180 }}>
      {#each b.links as l, i (i)}<a href={l.url} class="rounded-md px-3 py-2.5 font-semibold hover:bg-accent" onclick={() => (open = false)}>{l.label}</a>{/each}
    </nav>
  {/if}
</header>
