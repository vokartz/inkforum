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
    /** Geniş form (kayıt gibi) */
    wide?: boolean;
    /**
     * Tam ekran giriş düzeni: üst çubuk ve alt bilgi olmadan, solda büyük görsel.
     * (Giriş, kayıt ve şifre sayfaları; kök yerleşim bu sayfalarda üst çubuğu çizmez.)
     */
    showcase?: boolean;
    children: Snippet;
    footer?: Snippet;
  }
  let { title, description, wide = false, showcase = false, children, footer }: Props = $props();

  const s = $derived(page.data.viewer?.settings ?? {});
  const forumName = $derived(String(s['general.forumName'] ?? 'Forum'));
  const image = $derived(s['appearance.authImageUrl'] as string | null | undefined);
</script>

<svelte:head><title>{title} · {forumName}</title></svelte:head>

{#if showcase}
  <div class="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(28rem,1fr)]" data-part="auth-page">
    <!-- Sol: görsel -->
    <aside class="relative isolate hidden overflow-hidden lg:block" data-part="auth-visual">
      <!-- Yalnızca logo ve görsel (Yönetim → Görünüm → Giriş / kayıt görseli) -->
      {#if image}
        <img src={image} alt="" class="absolute inset-0 -z-20 size-full object-cover animate-[forum-auth-zoom_18s_ease-out_both]" />
      {:else}
        <div
          class="absolute inset-0 -z-20"
          style="background:radial-gradient(120% 80% at 10% 0%, color-mix(in oklch, var(--primary) 70%, white) 0%, var(--primary) 35%, color-mix(in oklch, var(--primary) 25%, black) 100%)"
        ></div>
      {/if}
      <div class="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-black/45 to-transparent"></div>
      <div class="p-10 xl:p-14">
        <a href="/" class="block w-fit rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-white/50"><BrandMark size={44} nameClass="text-xl text-white drop-shadow" /></a>
      </div>
    </aside>

    <!-- Sağ: form -->
    <main class="relative flex min-h-dvh flex-col bg-background">
      <div class="flex items-center justify-between px-6 py-5 sm:px-10">
        <a href="/" class="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeftIcon class="size-4" weight="bold" />{t('Foruma dön')}
        </a>
        <ThemeToggle loggedIn={false} timezone="Europe/Istanbul" />
      </div>
      <div class="flex flex-1 items-center justify-center px-6 pb-10 sm:px-10">
        <div class={cn('grid w-full gap-7 animate-rise', wide ? 'max-w-xl' : 'max-w-md')}>
          <header class="grid gap-2">
            <a href="/" class="mb-3 w-fit lg:hidden"><BrandMark size={38} /></a>
            <h1 class="text-3xl font-extrabold tracking-tight">{title}</h1>
            {#if description}<p class="text-muted-foreground">{description}</p>{/if}
          </header>
          {@render children()}
          {#if footer}
            <footer class="border-t pt-6 text-center text-sm text-muted-foreground">{@render footer()}</footer>
          {/if}
        </div>
      </div>
      <p class="px-6 pb-5 text-center text-xs text-muted-foreground sm:px-10">
        <a href="/policies/terms" class="hover:text-foreground">{t('Kullanım koşulları')}</a> · <a href="/policies/privacy" class="hover:text-foreground">{t('Gizlilik')}</a> ·
        <a href="/cookies" class="hover:text-foreground">{t('Çerezler')}</a>
      </p>
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
