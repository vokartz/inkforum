<script lang="ts">
  import CircleAlertIcon from 'phosphor-svelte/lib/WarningCircle';
  import CircleCheckIcon from 'phosphor-svelte/lib/CheckCircle';
  import { cn } from '$lib/utils';

  interface Props {
    message: string | null | undefined;
    variant?: 'error' | 'success' | 'info';
    class?: string;
  }
  let { message, variant = 'error', class: className }: Props = $props();
</script>

{#if message}
  <div
    role={variant === 'error' ? 'alert' : 'status'}
    class={cn(
      'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
      variant === 'error' && 'border-destructive/30 bg-destructive/10 text-destructive',
      variant === 'success' && 'border-success/30 bg-success/10 text-success',
      variant === 'info' && 'border-border bg-muted text-foreground',
      className,
    )}
  >
    {#if variant === 'success'}<CircleCheckIcon class="mt-0.5 size-4 shrink-0" />{:else}<CircleAlertIcon
        class="mt-0.5 size-4 shrink-0"
      />{/if}
    <span>{message}</span>
  </div>
{/if}
