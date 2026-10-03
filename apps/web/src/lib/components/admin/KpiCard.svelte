<script lang="ts">
  import TrendUpIcon from 'phosphor-svelte/lib/TrendUp';
  import TrendDownIcon from 'phosphor-svelte/lib/TrendDown';
  import { formatNumber } from '$lib/format';
  import { cn, type IconComponent } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    label: string;
    value: number;
    icon: IconComponent;
    series?: number[] | null;
    hint?: string | null;
    href?: string;
    tone?: string;
    index?: number;
  }
  let { label, value, icon: Icon, series = null, hint = null, href, tone = 'var(--primary)', index = 0 }: Props = $props();

  const trend = $derived.by(() => {
    if (!series || series.length < 14) return null;
    const cur = series.slice(-7).reduce((a, b) => a + b, 0);
    const prev = series.slice(-14, -7).reduce((a, b) => a + b, 0);
    if (!prev && !cur) return null;
    if (!prev) return { pct: 100, up: true, cur };
    const pct = Math.round(((cur - prev) / prev) * 100);
    return { pct: Math.abs(pct), up: pct >= 0, cur };
  });

  const W = 96;
  const H = 36;
  const path = $derived.by(() => {
    if (!series?.length) return null;
    const max = Math.max(1, ...series);
    const step = W / Math.max(1, series.length - 1);
    const pts = series.map((v, i) => [i * step, H - 2 - (v / max) * (H - 6)] as const);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return { line, area: `${line} L${W},${H} L0,${H} Z` };
  });
  const gid = `kpi-${Math.random().toString(36).slice(2, 8)}`;
</script>

<svelte:element
  this={href ? 'a' : 'div'}
  {href}
  style="--i:{index};--tone:{tone}"
  class={cn('group relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5 shadow-card animate-rise', href && 'lift hover:border-[color-mix(in_oklch,var(--tone)_40%,var(--border))]')}
  data-part="kpi"
>
  <div class="flex items-center gap-2.5">
    <span class="flex size-9 items-center justify-center rounded-xl text-[var(--tone)]" style="background:color-mix(in oklch, var(--tone) 14%, transparent)"><Icon class="size-5" weight="duotone" /></span>
    <span class="text-sm font-semibold text-muted-foreground">{label}</span>
  </div>
  <div class="flex items-end justify-between gap-3">
    <div class="grid gap-1">
      <span class="text-3xl leading-none font-extrabold tabular-nums">{formatNumber(value)}</span>
      {#if trend}
        <span class={cn('inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap', trend.up ? 'text-success' : 'text-destructive')}>
          {#if trend.up}<TrendUpIcon class="size-3.5" weight="bold" />{:else}<TrendDownIcon class="size-3.5" weight="bold" />{/if}%{trend.pct}
          <span class="font-normal text-muted-foreground">{t('son 7 gün')}</span>
        </span>
      {:else if hint}
        <span class="text-xs text-muted-foreground">{hint}</span>
      {/if}
    </div>
    {#if path}
      <svg viewBox="0 0 {W} {H}" width={W} height={H} class="shrink-0 overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--tone)" stop-opacity="0.35" />
            <stop offset="1" stop-color="var(--tone)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d={path.area} fill="url(#{gid})" />
        <path d={path.line} fill="none" stroke="var(--tone)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    {/if}
  </div>
</svelte:element>
