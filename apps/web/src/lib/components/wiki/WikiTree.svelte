<script lang="ts">
  import type { WikiTreeNode } from '@forum/shared';
  import { slide } from 'svelte/transition';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRight';
  import FileTextIcon from 'phosphor-svelte/lib/FileText';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import Self from './WikiTree.svelte';

  interface Props {
    nodes: WikiTreeNode[];
    current?: string | null;
    depth?: number;
    onnavigate?: () => void;
  }
  let { nodes, current = null, depth = 0, onnavigate }: Props = $props();

  const isAncestor = (n: WikiTreeNode) => !!current && (current === n.path || current.startsWith(`${n.path}/`));
  let toggled = $state<Record<number, boolean>>({});
  const open = (n: WikiTreeNode) => toggled[n.id] ?? isAncestor(n);
</script>

<ul class={cn('grid gap-px', depth > 0 && 'ml-3 border-l pl-2')} role={depth === 0 ? 'tree' : 'group'}>
  {#each nodes as n (n.id)}
    {@const active = current === n.path}
    {@const expanded = n.children.length > 0 && open(n)}
    <li role="treeitem" aria-selected={active} aria-expanded={n.children.length ? expanded : undefined}>
      <div class={cn('group flex items-center rounded-md transition-colors', active ? 'bg-primary-soft text-highlight' : 'hover:bg-accent')}>
        {#if n.children.length}
          <button type="button" class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" onclick={() => (toggled[n.id] = !expanded)} aria-label={expanded ? t('Daralt') : t('Genişlet')}>
            <CaretRightIcon class={cn('size-3 transition-transform duration-200', expanded && 'rotate-90')} weight="bold" />
          </button>
        {:else}
          <span class="size-7 shrink-0"></span>
        {/if}
        <a href="/wiki/{n.path}" onclick={() => onnavigate?.()} class={cn('flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-2 text-[13.5px] leading-tight', active ? 'font-semibold' : 'text-foreground/85')}>
          {#if n.iconNodes}<NodeIcon nodes={n.iconNodes} size={15} class={active ? 'text-primary' : 'text-muted-foreground'} />{:else}<FileTextIcon class="size-3.5 shrink-0 text-muted-foreground/70" />{/if}
          <span class="truncate">{n.title}</span>
          {#if !n.isPublished}<EyeSlashIcon class="size-3 shrink-0 text-muted-foreground" />{/if}
        </a>
      </div>
      {#if expanded}
        <div transition:slide={{ duration: 180 }}><Self nodes={n.children} {current} depth={depth + 1} {onnavigate} /></div>
      {/if}
    </li>
  {/each}
</ul>
