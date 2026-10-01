<script lang="ts">
  import { t } from '$lib/i18n.svelte';

  let { status }: { status: string } = $props();
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'Etkin', cls: 'bg-success/15 text-success' },
    pending_email: { label: 'E-posta bekliyor', cls: 'bg-muted text-muted-foreground' },
    pending_approval: { label: 'Onay bekliyor', cls: 'bg-warning/20 text-warning' },
    deactivated: { label: 'Devre dışı', cls: 'bg-destructive/10 text-destructive' },
  };
  const s = $derived(map[status] ?? { label: status, cls: 'bg-muted' });
</script>

<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap {s.cls}">{t(s.label)}</span>
