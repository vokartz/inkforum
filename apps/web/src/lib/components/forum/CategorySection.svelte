<script lang="ts">
  import type { Snippet } from 'svelte';
  import { slide } from 'svelte/transition';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDown';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import { page } from '$app/state';
  import { themeOptions } from '$lib/theme-options';

  interface Props {
    id: number;
    name: string;
    description?: string | null;
    collapsible?: boolean;
    background?: string | null;
    count?: number | null;
    columns?: boolean;
    children: Snippet;
  }
  let { id, name, description = null, collapsible = true, background = null, children }: Props = $props();

  const listStyle = $derived(themeOptions(page.data.viewer?.settings)?.forumList.style ?? 'table');
  const KEY = 'forum:collapsed-categories';
  let collapsed = $state(false);

  $effect(() => {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as number[];
      collapsed = collapsible && list.includes(id);
    } catch {
    }
  });

  function toggle() {
    collapsed = !collapsed;
    try {
      const list = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as number[]);
      if (collapsed) list.add(id);
      else list.delete(id);
      localStorage.setItem(KEY, JSON.stringify([...list]));
    } catch {
    }
  }
</script>

<section id="kategori-{id}" data-part="category" class="group/cat scroll-mt-24 overflow-hidden rounded-2xl border bg-card shadow-card">
  <header
    data-part="category-header"
    data-has-bg={background ? '' : undefined}
    class={cn('relative isolate flex items-center gap-4 overflow-hidden px-5', background ? 'min-h-24 py-5 text-white' : 'py-3.5')}
  >
    {#if background}
      <!-- Görsel + okunurluk için soldan koyulaşan örtü -->
      <div class="absolute inset-0 -z-10 bg-cover bg-center transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover/cat:scale-[1.03]" style="background-image:url('{background}')"></div>
      <div class="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(0_0_0/0.78)_0%,rgb(0_0_0/0.45)_55%,rgb(0_0_0/0.15)_100%)]"></div>
    {/if}

    <div class="min-w-0 flex-1">
      <h2 class={cn('flex items-center gap-2 font-bold tracking-tight', background ? 'text-xl drop-shadow' : 'text-[15px]')}>
        <span class="truncate">{name}</span>
      </h2>
      {#if description}
        <p class={cn('mt-0.5 truncate text-[13px]', background ? 'text-white/80' : 'text-muted-foreground')}>{description}</p>
      {/if}
    </div>
    {#if collapsible}
      <button
        type="button"
        onclick={toggle}
        class={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
          background ? 'bg-black/25 text-white backdrop-blur hover:bg-black/40' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t('Kategoriyi aç') : t('Kategoriyi daralt')}
      >
        <CaretDownIcon class={cn('size-4 transition-transform duration-300', collapsed && '-rotate-90')} weight="bold" />
      </button>
    {/if}
  </header>
  {#if !collapsed}
    <div transition:slide={{ duration: 240 }} class="border-t">
      {#if listStyle === 'cards'}
        <div class="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">{@render children()}</div>
      {:else}
        <div class="divide-y">{@render children()}</div>
      {/if}
    </div>
  {/if}
</section>
