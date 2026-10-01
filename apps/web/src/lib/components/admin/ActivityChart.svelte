<script lang="ts">
  import { t, localeTag } from '$lib/i18n.svelte';

  interface Series {
    label: string;
    color: string;
    points: Array<{ day: string; count: number }>;
  }
  let { series, height = 200 }: { series: Series[]; height?: number } = $props();

  const W = 640;
  const PAD = { l: 28, r: 8, t: 12, b: 22 };
  let hover = $state<number | null>(null);
  let svg = $state<SVGSVGElement | null>(null);

  const days = $derived(series[0]?.points.map((p) => p.day) ?? []);
  const max = $derived(Math.max(4, ...series.flatMap((s) => s.points.map((p) => p.count))));
  const niceMax = $derived(Math.ceil(max / 4) * 4);
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, days.length - 1);
  const y = (v: number) => PAD.t + (1 - v / niceMax) * (height - PAD.t - PAD.b);

  /** Yumuşak eğri (monoton kübik yaklaşımı) */
  function path(points: Array<{ count: number }>): string {
    if (!points.length) return '';
    let d = `M${x(0)},${y(points[0]!.count)}`;
    for (let i = 1; i < points.length; i++) {
      const x0 = x(i - 1);
      const x1 = x(i);
      const cx = (x0 + x1) / 2;
      d += ` C${cx},${y(points[i - 1]!.count)} ${cx},${y(points[i]!.count)} ${x1},${y(points[i]!.count)}`;
    }
    return d;
  }

  function onMove(e: PointerEvent) {
    if (!svg || !days.length) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (days.length - 1));
    hover = Math.min(days.length - 1, Math.max(0, i));
  }

  const fmtDay = (d: string) => new Intl.DateTimeFormat(localeTag(), { day: 'numeric', month: 'short' }).format(new Date(`${d}T12:00:00Z`));
</script>

<div class="relative">
  <svg
    bind:this={svg}
    viewBox="0 0 {W} {height}"
    class="w-full overflow-visible"
    role="img"
    aria-label={t('Etkinlik grafiği')}
    onpointermove={onMove}
    onpointerleave={() => (hover = null)}
  >
    <defs>
      {#each series as s, i (s.label)}
        <linearGradient id="ac-grad-{i}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color={s.color} stop-opacity="0.28" />
          <stop offset="100%" stop-color={s.color} stop-opacity="0" />
        </linearGradient>
      {/each}
    </defs>
    {#each [0, 0.25, 0.5, 0.75, 1] as g (g)}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(niceMax * g)} y2={y(niceMax * g)} stroke="var(--border)" stroke-dasharray={g === 0 ? '' : '3 4'} />
      <text x={PAD.l - 6} y={y(niceMax * g) + 3} text-anchor="end" font-size="10" fill="var(--muted-foreground)">{Math.round(niceMax * g)}</text>
    {/each}
    {#each series as s, i (s.label)}
      <path d="{path(s.points)} L{x(s.points.length - 1)},{y(0)} L{x(0)},{y(0)} Z" fill="url(#ac-grad-{i})" />
      <path d={path(s.points)} fill="none" stroke={s.color} stroke-width="2.25" stroke-linecap="round" class="ac-line" />
    {/each}
    {#if hover !== null}
      <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={height - PAD.b} stroke="var(--muted-foreground)" stroke-opacity="0.4" />
      {#each series as s (s.label)}
        <circle cx={x(hover)} cy={y(s.points[hover]?.count ?? 0)} r="4" fill={s.color} stroke="var(--card)" stroke-width="2" />
      {/each}
    {/if}
    {#each days as d, i (d)}
      {#if i === 0 || i === days.length - 1 || i % 4 === 0}
        <text x={x(i)} y={height - 5} text-anchor="middle" font-size="10" fill="var(--muted-foreground)">{fmtDay(d)}</text>
      {/if}
    {/each}
  </svg>
  {#if hover !== null}
    <div
      class="pointer-events-none absolute top-0 z-10 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg"
      style="left:clamp(0px, calc({(x(hover) / W) * 100}% - 70px), calc(100% - 140px))"
    >
      <p class="mb-1 font-semibold">{fmtDay(days[hover]!)}</p>
      {#each series as s (s.label)}
        <p class="flex items-center gap-1.5"><span class="size-2 rounded-full" style="background:{s.color}"></span>{s.label}: <strong>{s.points[hover]?.count ?? 0}</strong></p>
      {/each}
    </div>
  {/if}
  <div class="mt-2 flex gap-4 text-xs text-muted-foreground">
    {#each series as s (s.label)}<span class="flex items-center gap-1.5"><span class="h-1 w-4 rounded-full" style="background:{s.color}"></span>{s.label}</span>{/each}
  </div>
</div>

<style>
  .ac-line {
    stroke-dasharray: 2000;
    stroke-dashoffset: 2000;
    animation: ac-draw 1.1s ease-out forwards;
  }
  @keyframes ac-draw {
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
