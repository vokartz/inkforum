<script lang="ts">
  import { formatNumber } from '$lib/format';

  let { value }: { value: number } = $props();
  let shown = $state<number | null>(null);
  let el: HTMLElement;

  $effect(() => {
    const target = value;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || target < 5) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    shown = 0;
    const obs = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      obs.disconnect();
      const start = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - start) / 1200);
        shown = Math.round(target * (1 - (1 - k) ** 3));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    obs.observe(el);
    return () => obs.disconnect();
  });
</script>

<span bind:this={el} class="tabular-nums">{formatNumber(shown ?? value)}</span>
