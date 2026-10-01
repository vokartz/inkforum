<script lang="ts">
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import ImageIcon from 'phosphor-svelte/lib/Image';
  import { toast } from 'svelte-sonner';
  import { Input } from '$lib/components/ui/input';
  import { api, errorMessage } from '$lib/api';
  import { t } from '$lib/i18n.svelte';

  let { value = $bindable(''), label, uploadUrl = '/api/admin/pages/images' }: { value?: string; label?: string; uploadUrl?: string } = $props();
  let busy = $state(false);
  let dragging = $state(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error(t('Yalnızca görsel yüklenebilir.'));
    busy = true;
    try {
      value = (await api.upload<{ url: string }>(uploadUrl, file, file.name)).url;
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      busy = false;
    }
  }
</script>

<div class="grid gap-1.5">
  <span class="text-xs font-semibold text-muted-foreground">{label ?? t('Görsel')}</span>
  <label
    class="group relative flex h-24 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-muted/30 text-xs text-muted-foreground transition-colors hover:border-primary/50 {dragging ? 'border-primary bg-primary-soft' : ''}"
    ondragover={(e) => {
      e.preventDefault();
      dragging = true;
    }}
    ondragleave={() => (dragging = false)}
    ondrop={(e) => {
      e.preventDefault();
      dragging = false;
      void upload(e.dataTransfer?.files[0]);
    }}
  >
    {#if value}
      <img src={value} alt="" class="absolute inset-0 size-full object-cover" />
      <span class="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/55 font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"><UploadIcon class="size-4" />{t('Değiştir')}</span>
    {:else if busy}
      <LoaderIcon class="size-5 animate-spin" />
    {:else}
      <span class="flex flex-col items-center gap-1"><ImageIcon class="size-5" />{t('Yükle ya da sürükle bırak')}</span>
    {/if}
    {#if busy && value}<span class="absolute inset-0 flex items-center justify-center bg-black/50"><LoaderIcon class="size-5 animate-spin text-white" /></span>{/if}
    <input type="file" accept="image/*" class="hidden" onchange={(e) => upload((e.currentTarget as HTMLInputElement).files?.[0])} />
  </label>
  <div class="flex gap-1.5">
    <Input bind:value placeholder={t('ya da https://… adresi')} class="h-8 text-xs" />
    {#if value}<button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md border text-destructive hover:bg-destructive/10" onclick={() => (value = '')} aria-label={t('Görseli kaldır')}><TrashIcon class="size-4" /></button>{/if}
  </div>
</div>
