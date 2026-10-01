<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  interface Props {
    label?: string;
    for?: string;
    error?: string | null;
    hint?: string | null;
    required?: boolean;
    class?: string;
    children: Snippet;
  }
  let { label, for: forId, error = null, hint = null, required = false, class: className, children }: Props = $props();
</script>

<div class={cn('grid content-start gap-1.5', className)}>
  {#if label}
    <label for={forId} class="text-sm font-medium leading-none">
      {label}{#if required}<span class="text-destructive"> *</span>{/if}
    </label>
  {/if}
  {@render children()}
  {#if error}
    <p class="text-xs text-destructive" role="alert">{error}</p>
  {:else if hint}
    <p class="text-xs text-muted-foreground">{hint}</p>
  {/if}
</div>
