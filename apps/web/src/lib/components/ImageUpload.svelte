<script lang="ts">
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import { Button } from '$lib/components/ui/button';
  import { squareResize } from '$lib/image';
  import { fileSize } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    current: string | null;
    squareSize?: number;
    maxBytes: number;
    rounded?: boolean;
    previewSize?: number;
    previewWidth?: number;
    label?: string;
    onupload: (blob: Blob, filename: string) => Promise<void>;
    onremove?: () => Promise<void>;
  }
  let { current, squareSize = 0, maxBytes, rounded = false, previewSize = 96, previewWidth, label = t('Görsel seç'), onupload, onremove }: Props = $props();

  let input: HTMLInputElement;
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function pick(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (!file) return;
    error = null;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      error = t('Yalnızca PNG, JPEG, WEBP veya GIF seçebilirsiniz.');
      return;
    }
    busy = true;
    try {
      const blob = squareSize ? await squareResize(file, squareSize) : file;
      if (blob.size > maxBytes) {
        error = t('Dosya çok büyük ({size}). En fazla {max} olabilir.', { size: fileSize(blob.size), max: fileSize(maxBytes) });
        return;
      }
      const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/gif' ? 'gif' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
      await onupload(blob, `image.${ext}`);
    } catch (err) {
      error = err instanceof Error ? err.message : t('Yükleme başarısız.');
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!onremove) return;
    busy = true;
    try {
      await onremove();
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex items-center gap-4">
  <div
    class="flex shrink-0 items-center justify-center overflow-hidden border bg-muted {rounded ? 'rounded-full' : 'rounded-lg'}"
    style="width:{previewWidth ?? previewSize}px;height:{previewSize}px"
  >
    {#if current}
      <img src={current} alt="" class="h-full w-full {previewWidth ? 'object-contain p-1' : 'object-cover'}" />
    {:else}
      <UploadIcon class="size-6 text-muted-foreground" />
    {/if}
  </div>
  <div class="grid gap-2">
    <div class="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={busy} onclick={() => input.click()}>
        <UploadIcon />{busy ? t('Yükleniyor…') : label}
      </Button>
      {#if current && onremove}
        <Button variant="ghost" size="sm" disabled={busy} onclick={remove}><TrashIcon />{t('Kaldır')}</Button>
      {/if}
    </div>
    <p class="text-xs text-muted-foreground">{t('PNG, JPEG, WEBP veya GIF · en fazla {max}', { max: fileSize(maxBytes) })}</p>
    {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
  </div>
  <input bind:this={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" onchange={pick} />
</div>
