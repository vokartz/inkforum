<script lang="ts">
  import type { ResolvedBlock } from '@forum/shared';
  import { cn } from '$lib/utils';
  import BlockView from './BlockView.svelte';

  interface Props {
    blocks: ResolvedBlock[];
    editing?: boolean;
    standalone?: boolean;
  }
  let { blocks, editing = false, standalone = false }: Props = $props();

  const edge = (b: ResolvedBlock | undefined) => !!b && (b.width === 'full' || b.type === 'navbar' || b.type === 'footer');
</script>

<div class={cn('flow-root', standalone && 'flex min-h-dvh flex-col', standalone && !edge(blocks.at(-1)) && 'pb-12')} data-part="builder-page">
  {#each blocks as b, i (b.id)}
    {#if b.type === 'navbar'}
      <!-- Menü çubuğu sarmalayıcısız: yapışkan konum tüm sayfa boyunca geçerli olsun -->
      <BlockView block={b} {editing} />
    {:else}
      {@const prev = blocks[i - 1]}
      <div
        class={cn(
          i > 0 && !(edge(prev) && edge(b)) && 'mt-8 sm:mt-10',
          i === 0 && edge(b) && !editing && !standalone && '-mt-6 sm:-mt-8',
          standalone && !edge(b) && 'mx-auto w-full max-w-7xl px-4 sm:px-6',
          standalone && b.type === 'footer' && 'mt-auto pt-8 sm:pt-10',
        )}
      >
        <BlockView block={b} {editing} />
      </div>
    {/if}
  {/each}
</div>
