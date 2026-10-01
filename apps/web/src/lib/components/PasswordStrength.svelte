<script lang="ts">
  import { passwordStrength } from '@forum/shared';
  import { t } from '$lib/i18n.svelte';

  let { password }: { password: string } = $props();
  const score = $derived(passwordStrength(password));
  const labels = ['Çok zayıf', 'Zayıf', 'Orta', 'İyi', 'Güçlü'];
  const colors = ['bg-destructive', 'bg-destructive', 'bg-warning', 'bg-success', 'bg-success'];
</script>

{#if password}
  <div class="flex items-center gap-2" aria-live="polite">
    <div class="flex flex-1 gap-1">
      {#each { length: 4 } as _, i (i)}
        <div class="h-1 flex-1 rounded-full {i < Math.max(1, score) ? colors[score] : 'bg-muted'}"></div>
      {/each}
    </div>
    <span class="w-16 text-right text-xs text-muted-foreground">{t(labels[score] ?? '')}</span>
  </div>
{/if}
