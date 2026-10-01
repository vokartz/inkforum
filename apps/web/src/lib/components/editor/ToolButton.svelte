<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  interface Props extends HTMLButtonAttributes {
    label: string;
    active?: boolean;
    children: Snippet;
  }
  let { label, active = false, class: className, children, ...rest }: Props = $props();
</script>

<button
  type="button"
  title={label}
  aria-label={label}
  aria-pressed={active}
  class={cn(
    'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none [&_svg]:size-4',
    'hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40',
    active && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
    className,
  )}
  {...rest}
>
  {@render children()}
</button>
