<script lang="ts" module>
  import {
    siDiscord,
    siInstagram,
    siYoutube,
    siX,
    siFacebook,
    siTiktok,
    siTwitch,
    siKick,
    siTelegram,
    siWhatsapp,
    siReddit,
    siGithub,
    siSpotify,
    siSteam,
    siGoogle,
  } from 'simple-icons';

  export const BRANDS: Record<string, { path: string; color: string; fg?: string }> = {
    discord: { path: siDiscord.path, color: '#5865f2' },
    instagram: { path: siInstagram.path, color: 'linear-gradient(45deg,#f9ce34,#ee2a7b 50%,#6228d7)' },
    youtube: { path: siYoutube.path, color: '#ff0000' },
    x: { path: siX.path, color: '#000000' },
    facebook: { path: siFacebook.path, color: '#0866ff' },
    tiktok: { path: siTiktok.path, color: '#111111' },
    twitch: { path: siTwitch.path, color: '#9146ff' },
    kick: { path: siKick.path, color: '#53fc19', fg: '#000' },
    telegram: { path: siTelegram.path, color: '#26a5e4' },
    whatsapp: { path: siWhatsapp.path, color: '#25d366' },
    reddit: { path: siReddit.path, color: '#ff4500' },
    github: { path: siGithub.path, color: '#24292f' },
    spotify: { path: siSpotify.path, color: '#1ed760', fg: '#000' },
    steam: { path: siSteam.path, color: '#171a21' },
    google: { path: siGoogle.path, color: '#4285f4' },
  };
</script>

<script lang="ts">
  import GlobeIcon from 'phosphor-svelte/lib/Globe';
  import LinkedinIcon from 'phosphor-svelte/lib/Briefcase';
  import { cn } from '$lib/utils';

  interface Props {
    platform: string;
    size?: number;
    badge?: boolean;
    class?: string;
  }
  let { platform, size = 18, badge = false, class: className }: Props = $props();
  const brand = $derived(BRANDS[platform]);
</script>

{#snippet glyph()}
  {#if brand}
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><path d={brand.path} /></svg>
  {:else if platform === 'linkedin'}
    <LinkedinIcon style="width:{size}px;height:{size}px" />
  {:else}
    <GlobeIcon style="width:{size}px;height:{size}px" />
  {/if}
{/snippet}

{#if badge}
  <span
    class={cn('inline-flex shrink-0 items-center justify-center rounded-full transition-transform duration-200 hover:scale-110', className)}
    style="width:{size * 2.2}px;height:{size * 2.2}px;background:{brand?.color ?? (platform === 'linkedin' ? '#0a66c2' : 'var(--muted)')};color:{brand?.fg ?? '#fff'}"
  >
    {@render glyph()}
  </span>
{:else}
  <span class={cn('inline-flex', className)}>{@render glyph()}</span>
{/if}
