<script lang="ts">
  import type { TopicTag } from '@forum/shared';
  import { cn } from '$lib/utils';

  let { tags, size = 'sm', class: className }: { tags: TopicTag[]; size?: 'xs' | 'sm'; class?: string } = $props();
</script>

{#if tags.length}
  <span class={cn('inline-flex flex-wrap items-center gap-1', className)} data-part="tags">
    {#each tags as t (t.id)}
      <a
        href="/tags/{t.slug}"
        class={cn(
          'inline-flex items-center rounded-md border font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground',
          size === 'xs' ? 'px-1.5 py-px text-[11px]' : 'px-2 py-0.5 text-xs',
        )}
        style={t.color ? `border-color:color-mix(in oklch, ${t.color} 45%, transparent);color:${t.color}` : ''}
      >
        #{t.name}
      </a>
    {/each}
  </span>
{/if}
