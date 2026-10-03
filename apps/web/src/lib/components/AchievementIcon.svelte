<script lang="ts">
  import TrophyIcon from 'phosphor-svelte/lib/Trophy';
  import LockIcon from 'phosphor-svelte/lib/Lock';
  import { cn } from '$lib/utils';

  interface Props {
    iconUrl: string | null;
    tier: number;
    size?: number;
    locked?: boolean;
    class?: string;
  }
  let { iconUrl, tier, size = 48, locked = false, class: className }: Props = $props();

  const TIER_COLORS = ['#b45309', '#94a3b8', '#eab308', '#22d3ee', '#a855f7'];
  const color = $derived(TIER_COLORS[Math.min(Math.max(tier, 1), 5) - 1]);
</script>

<div
  class={cn('relative inline-flex shrink-0 items-center justify-center rounded-xl', locked && 'opacity-50 grayscale', className)}
  style="width:{size}px;height:{size}px;background:color-mix(in oklch, {color} 16%, transparent);box-shadow:inset 0 0 0 2px color-mix(in oklch, {color} 55%, transparent)"
>
  {#if iconUrl && !locked}
    <img src={iconUrl} alt="" class="h-[78%] w-[78%] object-contain" />
  {:else if locked}
    <LockIcon style="width:{size * 0.45}px;height:{size * 0.45}px;color:{color}" />
  {:else}
    <TrophyIcon style="width:{size * 0.5}px;height:{size * 0.5}px;color:{color}" />
  {/if}
</div>
