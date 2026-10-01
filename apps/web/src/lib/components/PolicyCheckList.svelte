<script lang="ts">
  import type { PolicyVersionPublic } from '@forum/shared';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Button } from '$lib/components/ui/button';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    policies: Array<Pick<PolicyVersionPublic, 'key' | 'versionId' | 'title' | 'bodyHtml' | 'isRequired' | 'changeNote'>>;
    accepted: number[];
    errors?: Record<string, string>;
  }
  let { policies, accepted = $bindable([]), errors = {} }: Props = $props();

  let reading = $state<(typeof policies)[number] | null>(null);

  function toggle(versionId: number, value: boolean) {
    accepted = value ? [...new Set([...accepted, versionId])] : accepted.filter((id) => id !== versionId);
  }
</script>

<div class="grid gap-2">
  {#each policies as p (p.versionId)}
    <div class="rounded-lg border p-3">
      <div class="flex items-start gap-2">
        <Checkbox
          id="policy-{p.key}"
          checked={accepted.includes(p.versionId)}
          onCheckedChange={(v) => toggle(p.versionId, v === true)}
          aria-invalid={!!errors[`policy_${p.key}`]}
          class="mt-0.5"
        />
        <label for="policy-{p.key}" class="text-sm leading-snug">
          <button type="button" class="font-medium text-primary hover:underline" onclick={() => (reading = p)}>{p.title}</button>
          {t('metnini okudum ve kabul ediyorum.')}{#if p.isRequired}<span class="text-destructive"> *</span>{/if}
          {#if p.changeNote}<span class="block text-xs text-muted-foreground">{t('Değişiklik: {note}', { note: p.changeNote })}</span>{/if}
        </label>
      </div>
      {#if errors[`policy_${p.key}`]}<p class="mt-1 text-xs text-destructive">{errors[`policy_${p.key}`]}</p>{/if}
    </div>
  {/each}
</div>

<Dialog.Root open={reading !== null} onOpenChange={(o) => !o && (reading = null)}>
  <Dialog.Content class="max-h-[85dvh] overflow-hidden sm:max-w-2xl">
    {#if reading}
      <Dialog.Header><Dialog.Title>{reading.title}</Dialog.Title></Dialog.Header>
      <div class="prose-forum max-h-[60dvh] overflow-y-auto pr-2 text-sm">{@html reading.bodyHtml}</div>
      <Dialog.Footer>
        <Button
          onclick={() => {
            toggle(reading!.versionId, true);
            reading = null;
          }}>{t('Okudum, kabul ediyorum')}</Button
        >
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
