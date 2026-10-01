<script lang="ts">
  import type { Viewer } from '@forum/shared';
  import { SOCIAL_PLATFORMS } from '@forum/shared';
  import BrandIcon from '../BrandIcon.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import LanguagePicker from './LanguagePicker.svelte';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  let { viewer }: { viewer: Viewer } = $props();
  const s = $derived(viewer.settings);
  const style = $derived(String(s['appearance.themeStyle'] ?? 'modern'));
  const links = $derived((s['appearance.footerLinks'] ?? []) as Array<{ label: string; url: string; newTab?: boolean }>);
  const social = $derived((s['appearance.socialLinks'] ?? []) as Array<{ platform: string; url: string }>);
  const label = (p: string) => t(SOCIAL_PLATFORMS.find((x) => x.key === p)?.label ?? p);
  const footerText = $derived(String(s['appearance.footerText'] ?? '').trim());
  const bg = $derived(s['appearance.footerBgUrl'] as string | null | undefined);
  const copyright = $derived(footerText || `© ${new Date().getFullYear()} ${s['general.forumName'] ?? 'Forum'}`);
  const poweredBy = $derived(s['appearance.poweredBy'] !== false);
</script>

{#snippet powered(cls: string)}
  {#if poweredBy}
    <a href="https://github.com/vokartz/inkforum" target="_blank" rel="noopener" class={cn('inline-flex items-center gap-1.5 transition-opacity hover:opacity-100', cls)} data-part="powered-by">
      <img src="/brand/inkforum-icon-192.png" alt="" class="size-3.5 rounded-[4px]" />{t('InkForum ile çalışır')}
    </a>
  {/if}
{/snippet}

{#snippet linkList(cls: string)}
  {#each links as l, i (l.url + i)}
    <a href={l.url} target={l.newTab ? '_blank' : undefined} rel={l.newTab ? 'noopener noreferrer' : undefined} class={cls}>{tc(l.label)}</a>
  {/each}
{/snippet}

{#snippet socialList()}
  {#each social as l, i (l.url + i)}
    <a href={l.url} target="_blank" rel="noopener noreferrer" aria-label={label(l.platform)} title={label(l.platform)} class="text-muted-foreground transition-colors hover:text-foreground">
      <BrandIcon platform={l.platform} size={18} />
    </a>
  {/each}
{/snippet}

{#if style === 'editorial'}
  <!-- Zarif: çift çizgiyle ayrılmış, ortalanmış künye -->
  <footer data-part="site-footer" class="mx-auto mt-14 w-full max-w-7xl px-3 pb-10 sm:px-6">
    <div class="editorial-rule px-4 py-6 text-center text-xs text-muted-foreground">
      <p class="mb-3 text-lg font-bold text-foreground" style="font-family:var(--heading-font)">{s['general.forumName'] ?? 'Forum'}</p>
      <nav class="flex flex-wrap justify-center gap-x-3 gap-y-1" aria-label={t('Alt bilgi')}>{@render linkList('hover:text-foreground hover:underline')}</nav>
      {#if social.length}<div class="mt-3 flex justify-center gap-3">{@render socialList()}</div>{/if}
      <p class="mt-3 whitespace-pre-line">{copyright}</p>
      <p class="mt-1.5 flex justify-center">{@render powered('opacity-80')}</p>
      <div class="mt-2 flex items-center justify-center gap-4"><LanguagePicker /><ThemeToggle variant="text" loggedIn={!!viewer.user} timezone={viewer.user?.timezone ?? 'Europe/Istanbul'} /></div>
    </div>
  </footer>
{:else}
  <footer
    data-part="site-footer"
    class={cn('relative isolate mt-14 border-t', bg ? 'text-white' : 'bg-card')}
  >
    {#if bg}
      <div class="absolute inset-0 -z-10 bg-cover bg-center" style="background-image:url('{bg}')"></div>
      <div class="absolute inset-0 -z-10 bg-black/60"></div>
    {/if}
    <div class="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-4 py-6 sm:px-6">
      <nav class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium" aria-label={t('Alt bilgi')}>
        {@render linkList(bg ? 'text-white/90 hover:text-white' : 'text-foreground/80 hover:text-foreground')}
      </nav>
      {#if social.length}<div class="flex items-center gap-4">{@render socialList()}</div>{/if}
    </div>
    <div class={cn('border-t', bg && 'border-white/15')}>
      <div class={cn('mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs sm:px-6', bg ? 'text-white/75' : 'text-muted-foreground')}>
        <p class="whitespace-pre-line">{copyright}</p>
        <span class="flex flex-wrap items-center gap-x-4 gap-y-2">
          {@render powered('opacity-75')}
          <LanguagePicker />
          <ThemeToggle variant="text" loggedIn={!!viewer.user} timezone={viewer.user?.timezone ?? 'Europe/Istanbul'} />
        </span>
      </div>
    </div>
  </footer>
{/if}
