<script lang="ts">
  import { t } from '$lib/i18n.svelte';

  let { target, doneText }: { target: number; doneText: string } = $props();
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
  const left = $derived(Math.max(0, target - now));
  const parts = $derived([
    { v: Math.floor(left / 86_400_000), l: 'Gün' },
    { v: Math.floor(left / 3_600_000) % 24, l: 'Saat' },
    { v: Math.floor(left / 60_000) % 60, l: 'Dakika' },
    { v: Math.floor(left / 1000) % 60, l: 'Saniye' },
  ]);
</script>

{#if left > 0}
  <div class="flex flex-wrap justify-center gap-3 sm:gap-4" data-part="countdown">
    {#each parts as p (p.l)}
      <div class="grid min-w-20 place-items-center rounded-xl border border-current/15 bg-current/5 px-4 py-3 backdrop-blur sm:min-w-24">
        <span class="text-3xl font-black tabular-nums sm:text-5xl">{String(p.v).padStart(2, '0')}</span>
        <span class="text-xs font-semibold tracking-wider uppercase opacity-70">{t(p.l)}</span>
      </div>
    {/each}
  </div>
{:else}
  <p class="text-2xl font-extrabold">{doneText || t('Süre doldu!')}</p>
{/if}
