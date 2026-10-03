<script lang="ts">
  import type { ExtensionStatus } from '@forum/shared';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { status }: { status: ExtensionStatus } = $props();
  const INFO = $derived<Record<ExtensionStatus, { label: string; cls: string }>>({
    active: { label: t('Etkin'), cls: 'bg-success/15 text-success' },
    disabled: { label: t('Kapalı'), cls: 'bg-muted text-muted-foreground' },
    error: { label: t('Hata'), cls: 'bg-destructive/15 text-destructive' },
    incompatible: { label: t('Uyumsuz'), cls: 'bg-warning/20 text-warning' },
  });
</script>

<span class={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', INFO[status].cls)}>{INFO[status].label}</span>
