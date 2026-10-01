<script lang="ts">
  import type { Component } from 'svelte';
  import { formatNumber } from '$lib/format';
  import { cn } from '$lib/utils';

  interface Props {
    label: string;
    value: number;
    icon: Component;
    href?: string;
    tone?: 'default' | 'warning' | 'danger' | 'success';
    hint?: string;
  }
  let { label, value, icon: Icon, href, tone = 'default', hint }: Props = $props();

  const toneClass = $derived(
    {
      default: 'bg-primary/10 text-primary',
      warning: 'bg-warning/20 text-warning',
      danger: 'bg-destructive/10 text-destructive',
      success: 'bg-success/15 text-success',
    }[tone],
  );
</script>

<svelte:element
  this={href ? 'a' : 'div'}
  {href}
  class={cn('flex items-center gap-4 rounded-xl border bg-card p-4', href && 'transition-colors hover:border-primary/40')}
>
  <div class="flex size-10 shrink-0 items-center justify-center rounded-lg {toneClass}"><Icon class="size-5" /></div>
  <div class="grid">
    <span class="text-2xl font-semibold tabular-nums">{formatNumber(value)}</span>
    <span class="text-xs text-muted-foreground">{label}{#if hint} · {hint}{/if}</span>
  </div>
</svelte:element>
