<script lang="ts">
  import { APPEARANCE_RESET_INFO, APPEARANCE_RESET_PARTS, type AppearanceResetPart } from '@forum/shared';
  import { toast } from 'svelte-sonner';
  import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import WarningIcon from 'phosphor-svelte/lib/Warning';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { api, errorMessage } from '$lib/api';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';

  let open = $state(false);
  let busy = $state(false);
  let picked = $state<AppearanceResetPart[]>(['theme']);

  function toggle(part: AppearanceResetPart, on: boolean) {
    picked = on ? [...new Set([...picked, part])] : picked.filter((p) => p !== part);
  }

  async function reset() {
    busy = true;
    try {
      await api.post('/api/admin/appearance/reset', { parts: picked });
      toast.success(t('Görünüm varsayılana döndürüldü.'));
      // Sayfadaki tüm alanlar yeni değerlerle yeniden kurulsun
      setTimeout(() => window.location.reload(), 400);
    } catch (e) {
      toast.error(errorMessage(e));
      busy = false;
    }
  }
</script>

<Button variant="outline" onclick={() => (open = true)}><ArrowCounterClockwiseIcon />{t('Varsayılana sıfırla')}</Button>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{t('Görünümü sıfırla')}</Dialog.Title>
      <Dialog.Description>{t('Seçtiğin bölümler ilk kurulumdaki hâline döner. Forum içeriği, üyeler ve eklenti verileri etkilenmez.')}</Dialog.Description>
    </Dialog.Header>
    <div class="grid gap-2">
      {#each APPEARANCE_RESET_PARTS as part (part)}
        {@const on = picked.includes(part)}
        <label class={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors', on ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted/50')}>
          <Checkbox checked={on} onCheckedChange={(v) => toggle(part, v === true)} class="mt-0.5" />
          <span class="min-w-0">
            <span class="block text-sm font-semibold">{t(APPEARANCE_RESET_INFO[part].label)}</span>
            <span class="block text-xs text-muted-foreground">{t(APPEARANCE_RESET_INFO[part].description)}</span>
          </span>
        </label>
      {/each}
    </div>
    {#if picked.includes('branding')}
      <p class="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
        <WarningIcon class="mt-0.5 size-4 shrink-0" />{t('Yüklenen logo ve görseller kalıcı olarak silinir; geri almak için yeniden yüklemen gerekir.')}
      </p>
    {/if}
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (open = false)}>{t('Vazgeç')}</Button>
      <Button variant="destructive" disabled={busy || !picked.length} onclick={reset}>
        {#if busy}<LoaderIcon class="animate-spin" />{:else}<ArrowCounterClockwiseIcon />{/if}{t('Seçilenleri sıfırla')}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
