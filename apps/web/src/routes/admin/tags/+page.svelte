<script lang="ts">
  import type { TagSummary } from '@forum/shared';
  import { goto, invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import HashIcon from 'phosphor-svelte/lib/Hash';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import SealCheckIcon from 'phosphor-svelte/lib/SealCheck';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import * as Table from '$lib/components/ui/table';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Field from '$lib/components/Field.svelte';
  import PageJump from '$lib/components/forum/PageJump.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatNumber } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  let q = $derived(data.q);
  let timer: ReturnType<typeof setTimeout> | undefined;
  function search() {
    clearTimeout(timer);
    timer = setTimeout(() => goto(`?q=${encodeURIComponent(q)}`, { keepFocus: true, replaceState: true, noScroll: true }), 250);
  }

  let open = $state(false);
  let editId = $state<number | null>(null);
  let name = $state('');
  let color = $state('');
  let official = $state(false);
  let error = $state<string | null>(null);
  let saving = $state(false);
  function openNew() {
    editId = null;
    name = '';
    color = '';
    official = false;
    error = null;
    open = true;
  }
  function openEdit(tag: TagSummary) {
    editId = tag.id;
    name = tag.name;
    color = tag.color ?? '';
    official = tag.isOfficial;
    error = null;
    open = true;
  }
  async function save() {
    saving = true;
    error = null;
    try {
      const body = { name, color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : null, isOfficial: official };
      if (editId) await api.put(`/api/admin/tags/${editId}`, body);
      else await api.post('/api/admin/tags', body);
      toast.success(editId ? t('Etiket güncellendi.') : t('Etiket oluşturuldu.'));
      open = false;
      await invalidate('app:admin-tags');
    } catch (e) {
      error = e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : errorMessage(e);
    } finally {
      saving = false;
    }
  }
  async function remove(tag: TagSummary) {
    if (!(await confirmAction({ title: t('#{name} silinsin mi?', { name: tag.name }), description: t('Etiket {n} konudan kaldırılır; konular silinmez.', { n: tag.topicCount }), confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/admin/tags/${tag.id}`);
      toast.success(t('Etiket silindi.'));
      await invalidate('app:admin-tags');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<svelte:head><title>{t('Etiketler · Yönetim')}</title></svelte:head>

<PageHeader title={t('Etiketler')} description={t('Konu etiketlerini düzenle, resmi etiketleri öne çıkar, benzerleri birleştir. Aynı ada yeniden adlandırılan etiketler otomatik birleşir.')} icon={HashIcon}>
  {#snippet actions()}
    <Button onclick={openNew}><PlusIcon weight="bold" />{t('Yeni etiket')}</Button>
  {/snippet}
</PageHeader>

{#if data.tags}
  <div class="mb-4 flex flex-wrap items-center gap-3">
    <div class="relative w-full sm:w-72">
      <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input bind:value={q} oninput={search} placeholder={t('Etiket ara…')} class="pl-9" />
    </div>
    <span class="text-sm text-muted-foreground">{t('{n} etiket', { n: formatNumber(data.tags.total) })}</span>
    <div class="ml-auto"><PageJump page={data.tags.page} perPage={data.tags.perPage} total={data.tags.total} /></div>
  </div>
  {#if data.tags.items.length}
    <div class="overflow-hidden rounded-xl border bg-card">
      <Table.Root>
        <Table.Header>
          <Table.Row><Table.Head>{t('Etiket')}</Table.Head><Table.Head class="hidden sm:table-cell">{t('Adres')}</Table.Head><Table.Head class="text-right">{t('Konu')}</Table.Head><Table.Head class="w-28"></Table.Head></Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.tags.items as tag (tag.id)}
            <Table.Row>
              <Table.Cell>
                <span class="inline-flex items-center gap-2 font-semibold">
                  <span class="size-2.5 rounded-full" style="background:{tag.color ?? 'var(--muted-foreground)'}"></span>#{tag.name}
                  {#if tag.isOfficial}<SealCheckIcon class="size-4 text-primary" weight="fill" aria-label={t('Resmi')} />{/if}
                </span>
              </Table.Cell>
              <Table.Cell class="hidden font-mono text-xs text-muted-foreground sm:table-cell">/tags/{tag.slug}</Table.Cell>
              <Table.Cell class="text-right tabular-nums">{formatNumber(tag.topicCount)}</Table.Cell>
              <Table.Cell class="text-right">
                <Button variant="ghost" size="icon-sm" href="/tags/{tag.slug}" target="_blank" aria-label={t('Görüntüle')}><ArrowSquareOutIcon /></Button>
                <Button variant="ghost" size="icon-sm" onclick={() => openEdit(tag)} aria-label={t('Düzenle')}><PencilIcon /></Button>
                <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => remove(tag)} aria-label={t('Sil')}><TrashIcon /></Button>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {:else}
    <EmptyState title={data.q ? t('Eşleşen etiket yok') : t('Henüz etiket yok')} description={t('Üyeler konu açarken etiket ekledikçe burada listelenir.')} />
  {/if}
{/if}

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header><Dialog.Title>{editId ? t('Etiketi düzenle') : t('Yeni etiket')}</Dialog.Title></Dialog.Header>
    <div class="grid gap-4">
      <Field label={t('Ad')} {error}><Input bind:value={name} maxlength={24} placeholder={t('ör. Etkinlik')} /></Field>
      <Field label={t('Renk (isteğe bağlı)')}>
        <div class="flex items-center gap-2">
          <input type="color" value={color || '#7b61ff'} oninput={(e) => (color = e.currentTarget.value)} class="h-9 w-12 cursor-pointer rounded border bg-transparent" aria-label={t('Renk seç')} />
          <Input bind:value={color} placeholder="#16a34a" class="font-mono" />
          {#if color}<Button variant="ghost" size="sm" onclick={() => (color = '')}>{t('Temizle')}</Button>{/if}
        </div>
      </Field>
      <label class="flex items-center justify-between gap-3 text-sm">{t('Resmi etiket (önerilerde en üstte)')} <Switch bind:checked={official} /></label>
    </div>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (open = false)}>{t('Vazgeç')}</Button>
      <Button onclick={save} disabled={saving || name.trim().length < 2}>{#if saving}<LoaderIcon class="animate-spin" />{/if}{t('Kaydet')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
