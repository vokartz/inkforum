<script lang="ts">
  import { t } from '$lib/i18n.svelte';

  let { points, max }: { points: number; max: number } = $props();
  const pct = $derived(Math.min(100, Math.round((points / Math.max(1, max)) * 100)));
  const color = $derived(pct >= 80 ? 'bg-destructive' : pct >= 50 ? 'bg-warning' : pct > 0 ? 'bg-amber-400' : 'bg-success');
</script>

<div class="grid gap-1" title={t('Uyarı seviyesi: {points}/{max}', { points, max })}>
  <div class="h-2 overflow-hidden rounded-full bg-muted">
    <div class="h-full rounded-full {color} transition-all" style="width:{Math.max(pct, points > 0 ? 4 : 0)}%"></div>
  </div>
  <div class="flex justify-between text-xs text-muted-foreground">
    <span>{t('Uyarı seviyesi')}</span>
    <span class="tabular-nums">{points} / {max}</span>
  </div>
</div>
