<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import ImageIcon from 'phosphor-svelte/lib/Image';
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import MoveVerticalIcon from 'phosphor-svelte/lib/ArrowsVertical';
  import Trash2Icon from 'phosphor-svelte/lib/Trash';
  import ChevronDownIcon from 'phosphor-svelte/lib/CaretDown';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import { api, errorMessage } from '$lib/api';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    cover: { url: string; offset: number } | null;
    color: string | null;
    canEdit: boolean;
    maxKb: number;
    actions?: Snippet;
  }
  let { cover, color, canEdit, maxKb, actions }: Props = $props();

  let offset = $state(50);
  let repositioning = $state(false);
  let uploading = $state(false);
  let dragging = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);
  let box = $state<HTMLElement | null>(null);
  let startY = 0;
  let startOffset = 50;

  function syncState1() {
    offset = cover?.offset ?? 50;
  }
  syncState1();
  $effect.pre(syncState1);

  async function upload(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > maxKb * 1024) return toast.error(t('Görsel en fazla {n} MB olabilir.', { n: Math.round(maxKb / 1024) }));
    uploading = true;
    try {
      await api.upload('/api/me/cover', file, file.name);
      toast.success(t('Kapak fotoğrafı güncellendi. Konumunu ayarlayabilirsiniz.'));
      await invalidateAll();
      repositioning = true;
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      uploading = false;
    }
  }

  async function remove() {
    try {
      await api.delete('/api/me/cover');
      toast.success(t('Kapak fotoğrafı kaldırıldı.'));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function savePosition() {
    try {
      await api.put('/api/me/cover', { offset });
      repositioning = false;
      toast.success(t('Konum kaydedildi.'));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (!repositioning) return;
    dragging = true;
    startY = e.clientY;
    startOffset = offset;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging || !box) return;
    const delta = ((e.clientY - startY) / box.clientHeight) * 100;
    offset = Math.min(100, Math.max(0, startOffset - delta));
  }
</script>

<div
  bind:this={box}
  data-part="profile-cover"
  class={cn('relative h-44 overflow-hidden sm:h-60', repositioning && 'cursor-grab touch-none select-none', dragging && 'cursor-grabbing')}
  style={cover
    ? `background:url('${cover.url}') center ${offset}%/cover no-repeat`
    : `background: color-mix(in oklch, ${color ?? 'var(--primary)'} 38%, var(--muted))`}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={() => (dragging = false)}
  role={repositioning ? 'slider' : undefined}
  aria-valuenow={repositioning ? Math.round(offset) : undefined}
>
  <!-- Kapak yokken düz renk; görsel varken düğmeler okunaklı kalsın diye hafif karartma -->
  {#if cover}<div class="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40"></div>{/if}

  {#if repositioning}
    <div class="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
      <span class="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm text-white backdrop-blur"><MoveVerticalIcon class="size-4" />{t('Konumlandırmak için sürükleyin')}</span>
    </div>
    <div class="absolute top-3 right-3 flex gap-2">
      <Button size="sm" variant="secondary" onclick={() => ((repositioning = false), syncState1())}>{t('Vazgeç')}</Button>
      <Button size="sm" onclick={savePosition}>{t('Konumu kaydet')}</Button>
    </div>
  {:else}
    <div class="absolute top-3 right-3 flex flex-wrap justify-end gap-2">
      {@render actions?.()}
      {#if canEdit}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button {...props} size="sm" variant="secondary" class="bg-black/45 text-white backdrop-blur hover:bg-black/60">
                {#if uploading}<LoaderIcon class="animate-spin" />{:else}<ImageIcon />{/if}<span class="hidden sm:inline">{t('Kapak fotoğrafı')}</span><ChevronDownIcon />
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-52">
            <DropdownMenu.Item onSelect={() => fileInput?.click()}><UploadIcon />{cover ? t('Değiştir') : t('Yükle')}</DropdownMenu.Item>
            {#if cover}
              <DropdownMenu.Item onSelect={() => (repositioning = true)}><MoveVerticalIcon />{t('Konumlandır')}</DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item variant="destructive" onSelect={remove}><Trash2Icon />{t('Kaldır')}</DropdownMenu.Item>
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        <input bind:this={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" onchange={upload} />
      {/if}
    </div>
  {/if}
</div>
