<script lang="ts">
  import type { NavEntry } from '@forum/shared';
  import { page } from '$app/state';
  import MenuIcon from 'phosphor-svelte/lib/List';
  import * as Sheet from '$lib/components/ui/sheet';
  import { buttonVariants } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import NodeIcon from '../NodeIcon.svelte';
  import BrandMark from './BrandMark.svelte';

  let { nav, class: className }: { nav: NavEntry[]; class?: string } = $props();
  let open = $state(false);

  const isActive = (href: string | null) =>
    !!href && (href === '/' ? page.url.pathname === '/' || /^\/(f|t|p)\//.test(page.url.pathname) : page.url.pathname.startsWith(href));
</script>

<Sheet.Root bind:open>
  <Sheet.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'md:hidden', className)} aria-label={t('Menü')}>
    <MenuIcon class="size-5" weight="bold" />
  </Sheet.Trigger>
  <Sheet.Content side="left" class="w-76 gap-0 p-0">
    <Sheet.Header class="border-b px-5 py-4"><Sheet.Title><BrandMark size={30} /></Sheet.Title></Sheet.Header>
    <nav class="grid gap-0.5 p-3">
      {#each nav as e (e.id)}
        {#if e.href}
          <a
            href={e.href}
            onclick={() => (open = false)}
            class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold {isActive(e.href) ? 'bg-primary-soft text-highlight' : 'hover:bg-accent'}"
          >
            {#if e.icon}<NodeIcon nodes={e.icon} size={19} />{/if}{e.label}
          </a>
        {:else}
          <p class="px-3 pt-4 pb-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{e.label}</p>
          {#each e.children as c (c.id)}
            <a href={c.href} onclick={() => (open = false)} class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent">
              {#if c.icon}<NodeIcon nodes={c.icon} size={17} />{/if}{c.label}
            </a>
          {/each}
        {/if}
      {/each}
    </nav>
  </Sheet.Content>
</Sheet.Root>
