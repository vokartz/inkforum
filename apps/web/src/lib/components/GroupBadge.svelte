<script lang="ts">
  import { tc } from '$lib/i18n.svelte';
  import type { GroupBadge } from '@forum/shared';
  import { cn } from '$lib/utils';
  import GroupStars from './GroupStars.svelte';

  interface Props {
    group: GroupBadge;
    stars?: boolean;
    href?: string | null;
    class?: string;
    bannerHeight?: number;
  }
  let { group, stars = true, href = null, class: className, bannerHeight = 26 }: Props = $props();

  const style = $derived(
    group.color
      ? `color:${group.color};border-color:color-mix(in oklch, ${group.color} 40%, transparent);background:color-mix(in oklch, ${group.color} 10%, transparent)`
      : '',
  );
</script>

{#if group.iconUrl && stars}
  <!-- Grubun rütbe görseli varsa ad yazılmaz; görsel yatay banner olarak gösterilir -->
  <svelte:element this={href ? 'a' : 'span'} {href} class={cn('inline-block w-fit', href && 'transition-opacity hover:opacity-80', className)} title={tc(group.name)} data-part="group-badge">
    <GroupStars count={group.iconCount} iconUrl={group.iconUrl} {bannerHeight} title={tc(group.name)} />
  </svelte:element>
{:else}
  <svelte:element
    this={href ? 'a' : 'span'}
    {href}
    class={cn(
      'inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
      !group.color && 'border-border bg-muted text-muted-foreground',
      href && 'hover:opacity-80',
      className,
    )}
    {style}
    data-part="group-badge"
  >
    <span>{tc(group.name)}</span>
    {#if stars && group.iconCount > 0}
      <GroupStars count={group.iconCount} color={group.color} size={11} />
    {/if}
  </svelte:element>
{/if}
