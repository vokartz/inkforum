<script lang="ts" module>
  export interface OrderNode {
    id: number;
    title: string;
    iconNodes: import('@forum/shared').IconNode | null;
    path: string;
    isPublished: boolean;
    children: OrderNode[];
  }
</script>

<script lang="ts">
  import { flip } from 'svelte/animate';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import DotsSixIcon from 'phosphor-svelte/lib/DotsSixVertical';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import Self from './WikiOrderZone.svelte';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import FileTextIcon from 'phosphor-svelte/lib/FileText';
  import { t } from '$lib/i18n.svelte';

  /** İç içe sürükle-bırak: bir sayfayı başka bir sayfanın altına bırakınca alt sayfası olur. */
  let { items = $bindable(), depth = 0, drag, onchange }: { items: OrderNode[]; depth?: number; drag: { active: boolean }; onchange: () => void } = $props();

  function consider(e: CustomEvent<DndEvent<OrderNode>>) {
    items = e.detail.items;
    drag.active = true;
  }
  function finalize(e: CustomEvent<DndEvent<OrderNode>>) {
    items = e.detail.items;
    drag.active = false;
    onchange();
  }
</script>

<div
  class="grid gap-1.5 rounded-lg transition-[min-height] {depth > 0 ? 'ml-7 pl-2' : 'min-h-9'} {depth > 0 && (items.length || drag.active) ? 'border-l-2 border-dashed' : ''} {depth > 0 && !items.length ? (drag.active ? 'min-h-8' : 'min-h-0') : ''}"
  use:dndzone={{ items, flipDurationMs: 150, type: 'wiki-tree', dropTargetStyle: { outline: '2px dashed var(--primary)', outlineOffset: '2px', borderRadius: '8px' } }}
  onconsider={consider}
  onfinalize={finalize}
>
  {#each items as n (n.id)}
    <div animate:flip={{ duration: 150 }}>
      <div class="group flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 shadow-xs">
        <DotsSixIcon class="size-4 shrink-0 cursor-grab text-muted-foreground" />
        <span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{#if n.iconNodes}<NodeIcon nodes={n.iconNodes} size={15} />{:else}<FileTextIcon class="size-3.5" />{/if}</span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5 text-sm font-semibold">{n.title}{#if !n.isPublished}<EyeSlashIcon class="size-3.5 text-muted-foreground" />{/if}</span>
          <span class="block truncate font-mono text-[11px] text-muted-foreground">/wiki/{n.path}</span>
        </span>
        <a href="/wiki/edit/{n.id}" class="flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground" title={t('Düzenle')}><PencilIcon class="size-4" /></a>
        <a href="/wiki/{n.path}" target="_blank" class="flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground" title={t('Görüntüle')}><ArrowSquareOutIcon class="size-4" /></a>
      </div>
      {#if depth < 6}
        <div class={n.children.length || drag.active ? 'mt-1.5' : ''}><Self bind:items={n.children} depth={depth + 1} {drag} {onchange} /></div>
      {/if}
    </div>
  {/each}
</div>
