<script lang="ts">
  import { TICKET_PRIORITY_LABELS, type TicketPriority } from '@forum/shared';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { priority, class: className }: { priority: TicketPriority; class?: string } = $props();
  const TONE: Record<TicketPriority, string> = {
    low: 'text-muted-foreground',
    normal: 'text-foreground/80',
    high: 'text-warning',
    urgent: 'text-destructive',
  };
  const BARS: Record<TicketPriority, number> = { low: 1, normal: 2, high: 3, urgent: 4 };
</script>

<span class={cn('inline-flex items-center gap-1.5 text-xs font-semibold', TONE[priority], className)} title={t('Öncelik: {priority}', { priority: t(TICKET_PRIORITY_LABELS[priority]) })}>
  <span class="flex items-end gap-px" aria-hidden="true">
    {#each [1, 2, 3, 4] as b (b)}<span class={cn('w-1 rounded-sm', b <= BARS[priority] ? 'bg-current' : 'bg-current opacity-20')} style="height:{3 + b * 2}px"></span>{/each}
  </span>{t(TICKET_PRIORITY_LABELS[priority])}
</span>
