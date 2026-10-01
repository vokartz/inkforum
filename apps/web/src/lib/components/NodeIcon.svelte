<script lang="ts">
  import type { IconNode } from '@forum/shared';
  import { cn } from '$lib/utils';

  interface Props {
    nodes: IconNode | null | undefined;
    size?: number;
    class?: string;
    style?: string;
  }
  let { nodes, size = 24, class: className, style }: Props = $props();
</script>

<!-- Phosphor ikonları sunucudan SVG düğümü olarak gelir (tüm ikon setini indirmemek için). -->
<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 256 256"
  fill="currentColor"
  class={cn('shrink-0', className)}
  {style}
  aria-hidden="true"
>
  {#each nodes ?? [] as [tag, attrs], i (i)}
    <svelte:element this={tag} {...attrs} />
  {/each}
</svg>
