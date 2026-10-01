<script lang="ts">
  import type { Snippet } from 'svelte';
  import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    label: string;
    description?: string | null;
    for?: string;
    error?: string | null;
    /** Değer varsayılandan farklı mı (rozet + "varsayılana dön") */
    modified?: boolean;
    onreset?: () => void;
    /** Kontrol dar mı (anahtar gibi): sağa yaslanır */
    inline?: boolean;
    children: Snippet;
  }
  let { label, description = null, for: forId, error = null, modified = false, onreset, inline = false, children }: Props = $props();
</script>

<div
  class={cn('grid gap-3 border-b px-5 py-5 last:border-b-0 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8', inline && 'grid-cols-[1fr_auto] md:grid-cols-[1fr_auto]')}
  data-part="setting-row"
>
  <div class="grid content-start gap-1">
    <div class="flex flex-wrap items-center gap-2">
      <label for={forId} class="text-sm font-semibold">{label}</label>
      {#if modified}
        <span class="rounded-md bg-primary-soft px-1.5 py-px text-[10px] font-bold text-highlight">{t('Değiştirildi')}</span>
        {#if onreset}
          <button type="button" onclick={onreset} class="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground" title={t('Varsayılan değere dön')}>
            <ArrowCounterClockwiseIcon class="size-3" />{t('Varsayılan')}
          </button>
        {/if}
      {/if}
    </div>
    {#if description}<p class="text-[13px] leading-relaxed text-muted-foreground">{description}</p>{/if}
  </div>
  <div class={cn('grid content-start gap-1.5', inline && 'justify-end')}>
    {@render children()}
    {#if error}<p class="text-xs text-destructive" role="alert">{error}</p>{/if}
  </div>
</div>
