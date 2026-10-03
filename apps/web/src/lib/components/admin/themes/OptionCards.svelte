<script lang="ts" generics="T extends string | number">
  import { cn } from '$lib/utils';

  let {
    value = $bindable(),
    options,
    cols = 3,
  }: { value: T; options: Array<{ value: T; label: string; hint?: string }>; cols?: number } = $props();
</script>

<div class="grid gap-1.5" style="grid-template-columns:repeat({cols}, minmax(0, 1fr))" role="radiogroup">
  {#each options as o (o.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === o.value}
      onclick={() => (value = o.value)}
      class={cn(
        'rounded-lg border px-2 py-2 text-left text-xs font-semibold transition-colors hover:bg-accent',
        value === o.value && 'border-primary bg-primary-soft',
      )}
    >
      {o.label}
      {#if o.hint}<span class="mt-0.5 block text-[11px] font-normal text-muted-foreground">{o.hint}</span
        >{/if}
    </button>
  {/each}
</div>
