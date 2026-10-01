<script lang="ts" module>
  import type { Component } from 'svelte';
  export interface PaletteItem {
    label: string;
    href: string;
    group: string;
    icon?: Component;
    keywords?: string;
  }
</script>

<script lang="ts">
  import { goto } from '$app/navigation';
  import { tick } from 'svelte';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import CornerDownLeftIcon from 'phosphor-svelte/lib/ArrowBendDownLeft';
  import * as Dialog from '$lib/components/ui/dialog';
  import { canonicalName } from '@forum/shared';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { items, open = $bindable(false) }: { items: PaletteItem[]; open?: boolean } = $props();

  let q = $state('');
  let active = $state(0);
  let input = $state<HTMLInputElement | null>(null);
  let list = $state<HTMLElement | null>(null);

  const results = $derived.by(() => {
    const term = canonicalName(q);
    if (!term) return items;
    return items.filter((i) => canonicalName(`${i.label} ${i.group} ${i.keywords ?? ''}`).includes(term));
  });

  $effect(() => {
    void q;
    active = 0;
  });

  $effect(() => {
    if (open) {
      q = '';
      void tick().then(() => input?.focus());
    }
  });

  function go(i: PaletteItem | undefined) {
    if (!i) return;
    open = false;
    void goto(i.href);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(results.length - 1, active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    }
    void tick().then(() => list?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }));
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open = !open;
    }
  }}
/>

<Dialog.Root bind:open>
  <Dialog.Content class="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
    <Dialog.Title class="sr-only">{t('Hızlı erişim')}</Dialog.Title>
    <div class="flex items-center gap-2 border-b px-4">
      <SearchIcon class="size-4 text-muted-foreground" />
      <input bind:this={input} bind:value={q} onkeydown={onKey} placeholder={t('Sayfa ya da işlem ara…')} class="h-12 w-full bg-transparent text-sm outline-none" />
      <kbd class="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
    </div>
    <div bind:this={list} class="max-h-80 overflow-y-auto p-2">
      {#each results as r, i (r.href + r.label)}
        {#if i === 0 || results[i - 1]!.group !== r.group}
          <p class="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{r.group}</p>
        {/if}
        <button
          type="button"
          data-i={i}
          class={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm', i === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60')}
          onpointermove={() => (active = i)}
          onclick={() => go(r)}
        >
          {#if r.icon}<r.icon class="size-4 text-muted-foreground" />{/if}
          <span class="flex-1">{r.label}</span>
          {#if i === active}<CornerDownLeftIcon class="size-3.5 text-muted-foreground" />{/if}
        </button>
      {:else}
        <p class="px-3 py-8 text-center text-sm text-muted-foreground">{t('Sonuç yok.')}</p>
      {/each}
    </div>
  </Dialog.Content>
</Dialog.Root>
