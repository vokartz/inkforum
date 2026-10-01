<script lang="ts">
  import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@forum/shared';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { status, class: className }: { status: ApplicationStatus; class?: string } = $props();
  const TONE: Record<ApplicationStatus, string> = {
    pending: 'bg-warning/15 text-warning',
    reviewing: 'bg-primary-soft text-highlight',
    approved: 'bg-success/15 text-success',
    rejected: 'bg-destructive/15 text-destructive',
    withdrawn: 'bg-muted text-muted-foreground',
  };
</script>

<span class={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap', TONE[status], className)}>
  <span class="size-1.5 rounded-full bg-current"></span>{t(APPLICATION_STATUS_LABELS[status])}
</span>
