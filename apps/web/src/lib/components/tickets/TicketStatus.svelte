<script lang="ts">
  import { TICKET_STATUS_LABELS, type TicketStatus } from '@forum/shared';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { status, class: className }: { status: TicketStatus; class?: string } = $props();
  const TONE: Record<TicketStatus, string> = {
    open: 'bg-primary-soft text-highlight',
    answered: 'bg-success/15 text-success',
    customer_reply: 'bg-warning/15 text-warning',
    on_hold: 'bg-muted text-muted-foreground',
    closed: 'bg-muted text-muted-foreground line-through decoration-1',
  };
</script>

<span class={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap', TONE[status], className)}>
  <span class="size-1.5 rounded-full bg-current no-underline"></span>{t(TICKET_STATUS_LABELS[status])}
</span>
