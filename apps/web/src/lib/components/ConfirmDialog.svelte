<script lang="ts">
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { buttonVariants } from '$lib/components/ui/button';
  import { confirmState } from '$lib/confirm.svelte';
  import { t } from '$lib/i18n.svelte';
</script>

<AlertDialog.Root
  open={confirmState.open}
  onOpenChange={(open) => {
    if (!open) confirmState.settle(false);
  }}
>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{confirmState.options.title}</AlertDialog.Title>
      {#if confirmState.options.description}
        <AlertDialog.Description>{confirmState.options.description}</AlertDialog.Description>
      {/if}
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={() => confirmState.settle(false)}>
        {confirmState.options.cancelLabel ?? t('Vazgeç')}
      </AlertDialog.Cancel>
      <AlertDialog.Action
        class={buttonVariants({ variant: confirmState.options.destructive ? 'destructive' : 'default' })}
        onclick={() => confirmState.settle(true)}
      >
        {confirmState.options.confirmLabel ?? t('Onayla')}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
