<script lang="ts">
  import type { NavEntry } from '@forum/shared';
  import { page } from '$app/state';
  import ChevronDownIcon from 'phosphor-svelte/lib/CaretDown';
  import EllipsisIcon from 'phosphor-svelte/lib/DotsThree';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { buttonVariants } from '$lib/components/ui/button';
  import NodeIcon from '../NodeIcon.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import { effectiveLanding } from '@forum/shared';

  interface Props {
    items: NavEntry[];
    /** pill: hap (modern); underline: alt çizgili (topluluk); tab: sekme (klasik) */
    variant?: 'pill' | 'underline' | 'tab' | 'smf';
  }
  let { items, variant = 'pill' }: Props = $props();

  let container = $state<HTMLElement | null>(null);
  let measure = $state<HTMLElement | null>(null);
  let visibleCount = $state(Number.POSITIVE_INFINITY);
  const MORE_WIDTH = 130;

  /** Forum sayfaları (bölüm, konu, mesaj) "Forum" öğesini etkin gösterir. */
  function active(e: NavEntry): boolean {
    const path = page.url.pathname;
    if (!e.href) return e.children.some(active);
    // Forum dizini "/" ya da (açılış sayfası varken) "/forum"; konu ve bölüm sayfaları da forumun parçası
    const landing = !!effectiveLanding(page.data.viewer?.settings);
    if (e.href === '/') return landing ? path === '/' : path === '/' || /^\/(f|t|p|new)(\/|$)/.test(path);
    if (e.href === '/forum') return /^\/(forum|f|t|p|new)(\/|$)/.test(path);
    if (/^https?:/i.test(e.href)) return false;
    return path === e.href || path.startsWith(`${e.href}/`);
  }

  function recompute() {
    if (!container || !measure) return;
    const widths = [...measure.children].map((c) => (c as HTMLElement).offsetWidth + 4);
    const total = widths.reduce((a, b) => a + b, 0);
    const avail = container.clientWidth;
    if (total <= avail) {
      visibleCount = items.length;
      return;
    }
    let sum = 0;
    let n = 0;
    for (const w of widths) {
      if (sum + w > avail - MORE_WIDTH) break;
      sum += w;
      n++;
    }
    visibleCount = Math.max(1, n);
  }

  $effect(() => {
    void items;
    if (!container) return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(container);
    recompute();
    return () => ro.disconnect();
  });

  const shown = $derived(items.slice(0, visibleCount));
  const overflow = $derived(items.slice(visibleCount));

  const linkClass = (on: boolean) =>
    cn(
      'group/nav relative inline-flex shrink-0 items-center gap-2 text-[14px] font-semibold whitespace-nowrap outline-none transition-[background-color,color,border-color] duration-200 focus-visible:ring-3 focus-visible:ring-ring/40',
      variant === 'pill' && ['h-9 rounded-full px-3.5', on ? 'bg-primary-soft text-[var(--nav-active)]' : 'text-topbar-foreground hover:bg-accent hover:text-foreground'],
      variant === 'underline' && [
        'h-14 border-b-2 px-3.5',
        on ? 'border-primary text-foreground' : 'border-transparent text-topbar-foreground/85 hover:text-foreground',
      ],
      variant === 'tab' && [
        'h-9 rounded-t-md border border-b-0 px-3.5',
        on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground/85 hover:bg-accent',
      ],
      // Klasik tema (SMF): küçük, yuvarlak düğmeler; etkin olan degrade
      // Klasik tema (SMF): sade yazı bağlantılar, etkin olan vurgu renginde küçük hap
      variant === 'smf' && ['h-7 rounded-[5px] px-2.5 text-[13px] font-semibold', on ? 'smf-button-active text-primary-foreground' : 'text-[var(--smf-text)] hover:underline'],
    );
</script>

{#snippet itemIcon(e: NavEntry)}
  {#if e.icon && variant !== 'smf'}<NodeIcon nodes={e.icon} size={18} class="opacity-75 transition-[opacity,transform] duration-200 group-hover/nav:scale-110 group-hover/nav:opacity-100" />{/if}
{/snippet}

{#snippet underline(_on: boolean)}{/snippet}

<div bind:this={container} class={cn('relative flex min-w-0 flex-1 items-center overflow-x-clip', variant === 'smf' && 'justify-center gap-0.5')} data-part="main-nav">
  <!-- Genişlik ölçümü için görünmez kopya -->
  <div bind:this={measure} class="pointer-events-none invisible absolute top-0 left-0 flex" aria-hidden="true">
    {#each items as e (e.id)}
      <span class={linkClass(false)}>{@render itemIcon(e)}{e.label}{#if !e.href}<ChevronDownIcon class="size-3.5" />{/if}</span>
    {/each}
  </div>

  <nav class="flex min-w-0 items-center gap-0.5" aria-label={t('Ana menü')}>
    {#each shown as e (e.id)}
      {@const on = active(e)}
      {#if e.href && e.style === 'button'}
        <a href={e.href} target={e.newTab ? '_blank' : undefined} rel={e.newTab ? 'noopener' : undefined} class={cn(buttonVariants({ size: 'sm' }), 'mx-1 shrink-0')} data-part="nav-button">
          {#if e.icon}<NodeIcon nodes={e.icon} size={16} />{/if}{e.label}
        </a>
      {:else if e.href}
        <a href={e.href} target={e.newTab ? '_blank' : undefined} rel={e.newTab ? 'noopener' : undefined} class={linkClass(on)} aria-current={on ? 'page' : undefined}>
          {@render itemIcon(e)}{e.label}{@render underline(on)}
        </a>
      {:else}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger class={linkClass(on)}>
            {@render itemIcon(e)}{e.label}<ChevronDownIcon class="size-3.5 opacity-70" />{@render underline(on)}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="min-w-48">
            {#each e.children as c (c.id)}
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a {...props} href={c.href} target={c.newTab ? '_blank' : undefined} rel={c.newTab ? 'noopener' : undefined}>
                    {#if c.icon}<NodeIcon nodes={c.icon} size={16} />{/if}{c.label}
                  </a>
                {/snippet}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}
    {/each}
    {#if overflow.length}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger class={linkClass(overflow.some(active))}>
          <EllipsisIcon class="size-4" />{t('Daha fazla')}<ChevronDownIcon class="size-3.5 opacity-70" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="min-w-52">
          {#each overflow as e (e.id)}
            {#if e.href}
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a {...props} href={e.href} target={e.newTab ? '_blank' : undefined}>{#if e.icon}<NodeIcon nodes={e.icon} size={16} />{/if}{e.label}</a>
                {/snippet}
              </DropdownMenu.Item>
            {:else}
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger>{#if e.icon}<NodeIcon nodes={e.icon} size={16} />{/if}{e.label}</DropdownMenu.SubTrigger>
                <DropdownMenu.SubContent>
                  {#each e.children as c (c.id)}
                    <DropdownMenu.Item>
                      {#snippet child({ props })}
                        <a {...props} href={c.href} target={c.newTab ? '_blank' : undefined}>{#if c.icon}<NodeIcon nodes={c.icon} size={16} />{/if}{c.label}</a>
                      {/snippet}
                    </DropdownMenu.Item>
                  {/each}
                </DropdownMenu.SubContent>
              </DropdownMenu.Sub>
            {/if}
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
  </nav>
</div>
