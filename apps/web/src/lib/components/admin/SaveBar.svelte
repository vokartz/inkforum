<script lang="ts">
  import { fly } from 'svelte/transition';
  import { beforeNavigate } from '$app/navigation';
  import FloppyIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
  import { Button } from '$lib/components/ui/button';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    /** Kaydedilmemiş değişiklik var mı */
    dirty: boolean;
    saving?: boolean;
    /** Değişen alan sayısı (isteğe bağlı) */
    count?: number | null;
    onsave: () => void | Promise<void>;
    onreset?: () => void;
  }
  let { dirty, saving = false, count = null, onsave, onreset }: Props = $props();

  // Kaydedilmemiş değişiklikle sayfadan çıkarken sor.
  beforeNavigate((nav) => {
    if (dirty && !saving && nav.type !== 'leave' && !confirm(t('Kaydedilmemiş değişiklikler var. Sayfadan çıkılsın mı?'))) nav.cancel();
  });

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && dirty) {
      e.preventDefault();
      void onsave();
    }
  }
</script>

<svelte:window onkeydown={onKey} onbeforeunload={(e) => dirty && e.preventDefault()} />

{#if dirty}
  <div transition:fly={{ y: 28, duration: 240 }} class="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4" data-part="save-bar">
    <div class="pointer-events-auto flex items-center gap-3 rounded-2xl border bg-popover py-2 pr-2 pl-4 shadow-lift">
      <span class="relative flex size-2.5"><span class="absolute size-full animate-[forum-ping_1.6s_ease-out_infinite] rounded-full bg-warning"></span><span class="relative size-2.5 rounded-full bg-warning"></span></span>
      <span class="text-sm font-semibold">{t('Kaydedilmemiş değişiklikler')}{#if count}&nbsp;({count}){/if}</span>
      <kbd class="hidden rounded-md border bg-muted px-1.5 font-sans text-[10px] font-bold text-muted-foreground sm:block">Ctrl S</kbd>
      {#if onreset}
        <Button variant="ghost" size="sm" onclick={onreset} disabled={saving}><ArrowCounterClockwiseIcon />{t('Geri al')}</Button>
      {/if}
      <Button size="sm" onclick={() => onsave()} disabled={saving}>{#if saving}<LoaderIcon class="animate-spin" />{:else}<FloppyIcon />{/if}{t('Kaydet')}</Button>
    </div>
  </div>
{/if}
