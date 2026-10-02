<script lang="ts">
  import WarningIcon from 'phosphor-svelte/lib/WarningCircle';
  import TrashIcon from 'phosphor-svelte/lib/Warning';
  import InfoIcon from 'phosphor-svelte/lib/Info';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { buttonVariants } from '$lib/components/ui/button';
  import { confirmState } from '$lib/confirm.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  const o = $derived(confirmState.options);
  const tone = $derived(o.tone ?? (o.destructive ? 'danger' : 'info'));
  const visual = $derived(
    tone === 'danger'
      ? { icon: TrashIcon, color: 'var(--destructive)' }
      : tone === 'warning'
        ? { icon: WarningIcon, color: 'var(--warning)' }
        : { icon: InfoIcon, color: 'var(--primary)' },
  );
  const blocked = $derived(!!o.input?.required && !confirmState.value.trim());

  function submit(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !o.input?.multiline) && !blocked) {
      e.preventDefault();
      confirmState.settle(true);
    }
  }
</script>

<AlertDialog.Root
  open={confirmState.open}
  onOpenChange={(open) => {
    if (!open) confirmState.settle(false);
  }}
>
  <AlertDialog.Content class="gap-0 overflow-hidden p-0 data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md" data-part="confirm-dialog">
    <div class="flex gap-4 p-5 sm:p-6">
      <span class="flex size-11 shrink-0 items-center justify-center rounded-full" style="background:color-mix(in oklch, {visual.color} 14%, transparent);color:{visual.color}">
        <visual.icon class="size-6" weight="duotone" />
      </span>
      <AlertDialog.Header class="min-w-0 flex-1 gap-1.5 text-left sm:text-left">
        <AlertDialog.Title class="text-base leading-snug font-semibold">{o.title}</AlertDialog.Title>
        {#if o.description}
          <AlertDialog.Description class="text-sm leading-relaxed">{o.description}</AlertDialog.Description>
        {/if}
        {#if o.input}
          <label class="mt-2 grid gap-1.5 text-sm">
            {#if o.input.label}<span class="font-medium">{o.input.label}</span>{/if}
            {#if o.input.multiline}
              <textarea
                bind:value={confirmState.value}
                rows="3"
                maxlength={o.input.maxLength ?? 500}
                placeholder={o.input.placeholder}
                onkeydown={submit}
                class="min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              ></textarea>
            {:else}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                bind:value={confirmState.value}
                maxlength={o.input.maxLength ?? 500}
                placeholder={o.input.placeholder}
                onkeydown={submit}
                autofocus
                class="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            {/if}
          </label>
        {/if}
      </AlertDialog.Header>
    </div>
    <AlertDialog.Footer class="mx-0 mb-0 gap-2 rounded-b-xl border-t bg-muted/30 px-5 py-3 sm:px-6">
      <AlertDialog.Cancel onclick={() => confirmState.settle(false)}>
        {o.cancelLabel ?? t('Vazgeç')}
      </AlertDialog.Cancel>
      <AlertDialog.Action
        class={cn(buttonVariants({ variant: tone === 'danger' ? 'destructive' : 'default' }))}
        disabled={blocked}
        onclick={() => confirmState.settle(true)}
      >
        {o.confirmLabel ?? t('Onayla')}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
