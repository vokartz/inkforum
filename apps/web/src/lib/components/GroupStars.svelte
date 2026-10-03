<script lang="ts">
  import StarIcon from 'phosphor-svelte/lib/Star';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    count: number;
    iconUrl?: string | null;
    color?: string | null;
    size?: number;
    bannerHeight?: number;
    title?: string;
  }
  let { count, iconUrl = null, color = null, size = 14, bannerHeight = 24, title }: Props = $props();
</script>

{#if iconUrl}
  <img src={iconUrl} alt={title ?? ''} {title} class="block w-auto max-w-full object-contain" style="height:{bannerHeight}px;max-width:{bannerHeight * 8}px" data-part="group-banner" />
{:else if count > 0}
  <span class="inline-flex items-center gap-px" aria-label={t('{count} yıldız', { count })}>
    {#each { length: Math.min(count, 10) } as _, i (i)}
      <StarIcon style="width:{size}px;height:{size}px;color:{color ?? 'var(--color-warning)'};fill:{color ?? 'var(--color-warning)'}" aria-hidden="true" />
    {/each}
  </span>
{/if}
