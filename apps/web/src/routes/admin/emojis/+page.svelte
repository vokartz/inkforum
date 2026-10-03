<script lang="ts">
  import { shortcodeFromFilename, type AdminCustomEmoji } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import StickerIcon from 'phosphor-svelte/lib/Sticker';
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import { ApiError, errorMessage, request, api } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const items = $derived(data.items ?? []);
  let filter = $state('');
  const shown = $derived(items.filter((e) => !filter.trim() || `${e.shortcode} ${e.name} ${e.category}`.toLocaleLowerCase('tr-TR').includes(filter.trim().toLocaleLowerCase('tr-TR'))));
  const categories = $derived([...new Set(shown.map((e) => e.category))]);
  const allCategories = $derived([...new Set(items.map((e) => e.category))]);

  let category = $state(t('Özel'));
  let dragging = $state(false);
  let queue = $state<Array<{ name: string; status: 'wait' | 'ok' | 'error'; error?: string }>>([]);
  let uploading = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  async function uploadFiles(files: FileList | File[]) {
    const list = [...files].filter((f) => /^image\/(png|gif|webp|jpeg)$/.test(f.type));
    if (!list.length) return toast.error(t('PNG, GIF, WEBP ya da JPEG seçin.'));
    uploading = true;
    queue = list.map((f) => ({ name: f.name, status: 'wait' }));
    for (const [i, f] of list.entries()) {
      const form = new FormData();
      form.append('shortcode', shortcodeFromFilename(f.name));
      form.append('category', category.trim() || t('Özel'));
      form.append('file', f, f.name);
      try {
        await request(fetch, '/api/admin/emojis', { method: 'POST', body: form });
        queue[i]!.status = 'ok';
      } catch (e) {
        queue[i] = { name: f.name, status: 'error', error: e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : errorMessage(e) };
      }
    }
    uploading = false;
    const ok = queue.filter((q) => q.status === 'ok').length;
    if (ok) toast.success(t('{n} emoji eklendi.', { n: ok }));
    await invalidate('app:admin-emojis');
    if (fileInput) fileInput.value = '';
  }
  function ondrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files.length) void uploadFiles(e.dataTransfer.files);
  }

  let edit = $state<AdminCustomEmoji | null>(null);
  let form = $state({ shortcode: '', name: '', category: '', isEnabled: true });
  let saving = $state(false);
  let error = $state<string | null>(null);
  function open(e: AdminCustomEmoji) {
    edit = e;
    form = { shortcode: e.shortcode, name: e.name, category: e.category, isEnabled: e.isEnabled };
    error = null;
  }
  async function save() {
    if (!edit) return;
    saving = true;
    error = null;
    try {
      await api.put(`/api/admin/emojis/${edit.id}`, form);
      toast.success(t('Emoji güncellendi. Kullanıldığı mesajlar arka planda yenilenir.'));
      edit = null;
      await invalidate('app:admin-emojis');
    } catch (e) {
      error = e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : errorMessage(e);
    } finally {
      saving = false;
    }
  }
  async function remove() {
    if (!edit) return;
    const target = edit;
    if (!(await confirmAction({ title: t(':{shortcode}: silinsin mi?', { shortcode: target.shortcode }), description: t('Mesajlarda yazı olarak (:kisaad:) görünmeye devam eder.'), confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/admin/emojis/${target.id}`);
      toast.success(t('Emoji silindi.'));
      edit = null;
      await invalidate('app:admin-emojis');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<svelte:head><title>{t('Özel emojiler')} · {t('Yönetim')}</title></svelte:head>

<PageHeader title={t('Özel emojiler')} description={t('Forumuna özel PNG, GIF (hareketli) ve WEBP emojiler ekle. Üyeler :kisaad: yazarak ya da emoji seçicinin ✨ sekmesinden kullanır.')} icon={StickerIcon} />

{#if data.items}
  <!-- Yükleme alanı -->
  <div
    role="region"
    aria-label={t('Emoji yükleme alanı')}
    class={cn('mb-5 grid gap-4 rounded-xl border-2 border-dashed bg-card p-5 transition-colors sm:grid-cols-[1fr_16rem]', dragging && 'border-primary bg-primary-soft')}
    ondragover={(e) => {
      e.preventDefault();
      dragging = true;
    }}
    ondragleave={() => (dragging = false)}
    {ondrop}
  >
    <div class="flex items-center gap-4">
      <span class="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><UploadIcon class="size-6" /></span>
      <div class="grid gap-1">
        <p class="font-semibold">{t('Dosyaları buraya sürükle ya da seç')}</p>
        <p class="text-sm text-muted-foreground">
          {t('Birden çok dosya seçebilirsin. Kısa ad dosya adından üretilir')} ("Mutlu Kedi.gif" → <code>:mutlu_kedi:</code>). {t('En fazla 512 KB, 512×512.')}
        </p>
        <div class="mt-1">
          <input bind:this={fileInput} type="file" accept="image/png,image/gif,image/webp,image/jpeg" multiple class="hidden" onchange={(e) => e.currentTarget.files && uploadFiles(e.currentTarget.files)} />
          <Button size="sm" onclick={() => fileInput?.click()} disabled={uploading}>{#if uploading}<LoaderIcon class="animate-spin" />{:else}<UploadIcon />{/if}{t('Dosya seç')}</Button>
        </div>
      </div>
    </div>
    <Field label={t('Kategori')} hint={t('Seçicide bu başlık altında görünür.')}>
      <Input bind:value={category} list="emoji-cats" maxlength={40} />
      <datalist id="emoji-cats">{#each allCategories as c (c)}<option value={c}></option>{/each}</datalist>
    </Field>
    {#if queue.length}
      <ul class="grid gap-1 text-xs sm:col-span-2">
        {#each queue as q, i (i)}
          <li class={cn('flex items-center gap-2', q.status === 'error' && 'text-destructive', q.status === 'ok' && 'text-success')}>
            {#if q.status === 'wait'}<LoaderIcon class="size-3.5 animate-spin" />{:else}<span class="size-1.5 rounded-full bg-current"></span>{/if}
            {q.name}{#if q.error}: {q.error}{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if items.length}
    <div class="mb-4 flex items-center gap-3">
      <div class="relative w-full sm:w-72">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input bind:value={filter} placeholder={t('Emoji ara…')} class="pl-9" />
      </div>
      <span class="text-sm text-muted-foreground">{t('{n} emoji', { n: items.length })}</span>
    </div>
    <div class="grid gap-5">
      {#each categories as c (c)}
        <section>
          <h2 class="mb-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">{c}</h2>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
            {#each shown.filter((e) => e.category === c) as e (e.id)}
              <button type="button" onclick={() => open(e)} class={cn('group grid justify-items-center gap-2 rounded-lg border bg-card p-3 text-center transition-colors hover:border-primary', !e.isEnabled && 'opacity-50')}>
                <img src={e.url} alt=":{e.shortcode}:" class="size-10 object-contain transition-transform group-hover:scale-110" loading="lazy" />
                <span class="flex w-full items-center justify-center gap-1 truncate font-mono text-[11px]">{#if !e.isEnabled}<EyeSlashIcon class="size-3 shrink-0" />{/if}:{e.shortcode}:</span>
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {:else}
    <p class="rounded-lg border bg-card px-4 py-10 text-center text-sm text-muted-foreground">{t('Henüz özel emoji yok. Yukarıdan ilk emojilerini yükle.')}</p>
  {/if}
{/if}

<Dialog.Root open={edit !== null} onOpenChange={(o) => !o && (edit = null)}>
  <Dialog.Content class="sm:max-w-md">
    {#if edit}
      <Dialog.Header>
        <Dialog.Title class="flex items-center gap-3"><img src={edit.url} alt="" class="size-9 object-contain" />{t('Emojiyi düzenle')}</Dialog.Title>
        <Dialog.Description>{t('Kısa ad değişirse eski adı kullanan mesajlarda emoji yazı olarak kalır.')}</Dialog.Description>
      </Dialog.Header>
      <div class="grid gap-4">
        <Field label={t('Kısa ad')} {error}>
          <div class="flex items-center rounded-md border bg-background focus-within:border-ring">
            <span class="pl-3 font-mono text-muted-foreground">:</span>
            <input bind:value={form.shortcode} maxlength={32} class="h-9 min-w-0 flex-1 bg-transparent px-1 font-mono text-sm outline-none" />
            <span class="pr-3 font-mono text-muted-foreground">:</span>
          </div>
        </Field>
        <Field label={t('Ad (ipucu)')}><Input bind:value={form.name} maxlength={60} /></Field>
        <Field label={t('Kategori')}><Input bind:value={form.category} list="emoji-cats" maxlength={40} /></Field>
        <label class="flex items-center justify-between gap-3 text-sm">{t('Etkin')} <Switch bind:checked={form.isEnabled} /></label>
      </div>
      <Dialog.Footer class="sm:justify-between">
        <Button variant="ghost" class="text-destructive" onclick={remove}><TrashIcon />{t('Sil')}</Button>
        <div class="flex gap-2">
          <Button variant="ghost" onclick={() => (edit = null)}>{t('Vazgeç')}</Button>
          <Button onclick={save} disabled={saving}>{#if saving}<LoaderIcon class="animate-spin" />{/if}{t('Kaydet')}</Button>
        </div>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
