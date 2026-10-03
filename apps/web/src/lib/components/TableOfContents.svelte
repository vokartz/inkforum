<script lang="ts">
  import ListIcon from 'phosphor-svelte/lib/ListBullets';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    items: Array<{ id: string; text: string; level: 2 | 3 | 4 }>;
    title?: string;
    class?: string;
  }
  let { items, title = t('Bu sayfada'), class: className }: Props = $props();

  let activeId = $state<string | null>(null);
  $effect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) activeId = top.target.id;
      },
      { rootMargin: '-80px 0px -65% 0px' },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  });

  function go(e: MouseEvent, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(history.state, '', `#${id}`);
    activeId = id;
  }
</script>

{#if items.length}
  <nav class={cn('grid gap-2 text-sm', className)} aria-label={title} data-part="toc">
    <p class="flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase"><ListIcon class="size-3.5" />{title}</p>
    <ul class="grid border-l">
      {#each items as it (it.id)}
        <li>
          <a
            href="#{it.id}"
            onclick={(e) => go(e, it.id)}
            class={cn(
              '-ml-px block border-l-2 py-1 pr-2 leading-snug transition-colors',
              it.level === 2 ? 'pl-3' : it.level === 3 ? 'pl-6 text-[13px]' : 'pl-9 text-xs',
              activeId === it.id ? 'border-primary font-semibold text-highlight' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}>{it.text}</a
          >
        </li>
      {/each}
    </ul>
  </nav>
{/if}
