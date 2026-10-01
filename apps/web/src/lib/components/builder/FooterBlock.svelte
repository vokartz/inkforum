<script lang="ts">
  import type { BuilderBlock } from '@forum/shared';
  import { page } from '$app/state';
  import BrandMark from '$lib/components/layout/BrandMark.svelte';
  import BrandIcon from '$lib/components/BrandIcon.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  type Footer = Extract<BuilderBlock, { type: 'footer' }>;
  let { block: b }: { block: Footer } = $props();

  const s = $derived(page.data.viewer?.settings ?? {});
  const forumName = $derived(String(s['general.forumName'] ?? 'Forum'));
  const social = $derived((s['appearance.socialLinks'] as Array<{ platform: string; url: string }> | undefined) ?? []);
  const dark = $derived(b.background === 'dark' || b.background === 'accent' || b.background === 'image');
  const year = new Date().getFullYear();
</script>

<footer
  id={b.anchor || undefined}
  data-part="block-footer"
  class={cn(
    'relative w-full',
    b.background === 'card' && 'border-t bg-card',
    b.background === 'muted' && 'bg-muted/60',
    b.background === 'dark' && 'bg-zinc-950 text-white',
    b.background === 'accent' && 'bg-primary text-primary-foreground',
  )}
>
  <div class="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
    <div class="grid content-start gap-3">
      {#if b.showLogo}<a href="/" class="w-fit"><BrandMark size={38} nameClass={dark ? 'text-white' : ''} /></a>{/if}
      {#if b.text}<p class={cn('max-w-sm text-sm leading-relaxed whitespace-pre-line', dark ? 'text-white/70' : 'text-muted-foreground')}>{b.text}</p>{/if}
      {#if b.showSocial && social.length}
        <div class="mt-1 flex flex-wrap gap-2">
          {#each social as l (l.url)}
            <a href={l.url} target="_blank" rel="noopener" class="transition-transform hover:-translate-y-0.5" aria-label={l.platform}><BrandIcon platform={l.platform} size={16} badge /></a>
          {/each}
        </div>
      {/if}
    </div>
    {#each b.columns as c, i (i)}
      <div class="grid content-start gap-3">
        {#if c.title}<h3 class={cn('text-xs font-bold tracking-wider uppercase', dark ? 'text-white/60' : 'text-muted-foreground')}>{c.title}</h3>{/if}
        <ul class="grid gap-2 text-sm">
          {#each c.links as l, k (k)}<li><a href={l.url} class={cn('transition-colors', dark ? 'text-white/85 hover:text-white' : 'text-foreground/80 hover:text-foreground')}>{l.label}</a></li>{/each}
        </ul>
      </div>
    {/each}
  </div>
  <div class={cn('border-t', dark && 'border-white/10')}>
    <p class={cn('mx-auto w-full max-w-7xl px-4 py-4 text-xs sm:px-6', dark ? 'text-white/60' : 'text-muted-foreground')}>© {year} {forumName}. {t('Tüm hakları saklıdır.')}</p>
  </div>
</footer>
