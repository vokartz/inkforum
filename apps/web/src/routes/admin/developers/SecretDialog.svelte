<script lang="ts">
  import { toast } from 'svelte-sonner';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import WarningIcon from 'phosphor-svelte/lib/Warning';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { t } from '$lib/i18n.svelte';

  /** Yalnızca bir kez gösterilen gizli değerler (istemci anahtarı, API anahtarı, webhook imza anahtarı). */
  let { title, items = $bindable(null), note = '' }: { title: string; items: Array<{ label: string; value: string }> | null; note?: string } = $props();

  async function copy(v: string) {
    try {
      await navigator.clipboard.writeText(v);
      toast.success(t('Kopyalandı.'));
    } catch {
      toast.error(t('Kopyalanamadı; elle seçin.'));
    }
  }
</script>

<Dialog.Root open={items !== null} onOpenChange={(o) => !o && (items = null)}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description class="flex items-start gap-2"><WarningIcon class="mt-0.5 size-4 shrink-0 text-warning" />{t('Bu değerler güvenlik gereği yalnızca şimdi gösterilir. Kopyalayıp güvenli bir yerde sakla.')}</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-3">
      {#each items ?? [] as it (it.label)}
        <div class="grid gap-1">
          <span class="text-xs font-semibold text-muted-foreground">{it.label}</span>
          <div class="flex items-center gap-2">
            <code class="min-w-0 flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all select-all">{it.value}</code>
            <Button variant="outline" size="icon" aria-label={t('Kopyala')} onclick={() => copy(it.value)}><CopyIcon /></Button>
          </div>
        </div>
      {/each}
      {#if note}<p class="text-xs text-muted-foreground">{note}</p>{/if}
    </div>
    <Dialog.Footer><Button onclick={() => (items = null)}>{t('Kaydettim')}</Button></Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
