<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/ListChecks';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api, errorMessage } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { confirmAction } from '$lib/confirm.svelte';
  import { t } from '$lib/i18n.svelte';
  import type { AdminProfileField } from './+page';

  let { data } = $props();

  const typeLabels: Record<string, string> = {
    text: 'Kısa metin',
    textarea: 'Uzun metin',
    select: 'Açılır liste',
    radio: 'Tekli seçim',
    checkbox: 'Onay kutusu',
    url: 'Bağlantı',
    number: 'Sayı',
    date: 'Tarih',
  };
  const visibilityLabels: Record<string, string> = {
    public: 'Herkes',
    members: 'Üyeler',
    owner_staff: 'Sahibi ve yetkililer',
    staff: 'Yalnız yetkililer',
  };

  const empty = (): Omit<AdminProfileField, 'id'> => ({
    key: '',
    name: '',
    description: '',
    type: 'text',
    options: [],
    regex: null,
    maxLength: 255,
    isRequired: false,
    showOnRegister: false,
    showInProfile: true,
    showInPosts: false,
    visibility: 'public',
    editableBy: 'owner',
    isActive: true,
    sortOrder: 0,
  });

  let open = $state(false);
  let editingId = $state<number | null>(null);
  let f = $state(empty());
  let optionsText = $state('');
  const form = createForm();

  function edit(field: AdminProfileField | null) {
    form.clear();
    editingId = field?.id ?? null;
    f = field ? { ...field } : empty();
    optionsText = (field?.options ?? []).join('\n');
    open = true;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    const body = { ...f, options: optionsText.split('\n').map((s) => s.trim()).filter(Boolean), regex: f.regex || null, maxLength: Number(f.maxLength), sortOrder: Number(f.sortOrder) };
    const res = await form.submit(() => (editingId ? api.put(`/api/admin/profile-fields/${editingId}`, body) : api.post('/api/admin/profile-fields', body)), {
      success: t('Alan kaydedildi.'),
    });
    if (res) {
      open = false;
      await invalidate('app:admin-fields');
    }
  }

  async function remove(field: AdminProfileField) {
    if (!(await confirmAction({ title: t('"{name}" alanı silinsin mi?', { name: field.name }), description: t('Üyelerin bu alana girdiği tüm değerler de silinir.'), destructive: true, confirmLabel: t('Sil') }))) return;
    try {
      await api.delete(`/api/admin/profile-fields/${field.id}`);
      toast.success(t('Alan silindi.'));
      await invalidate('app:admin-fields');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<PageHeader icon={PageHeaderIcon} title={t('Özel profil alanları')} description={t('Üye profillerine ek alanlar ekleyin (ör. Discord, meslek, favori takım).')}>
  {#snippet actions()}<Button size="sm" onclick={() => edit(null)}><PlusIcon />{t('Yeni alan')}</Button>{/snippet}
</PageHeader>

{#if !data.fields.length}
  <EmptyState title={t('Özel alan yok')} description={t('Kayıt formunda veya profilde göstermek istediğiniz ek bilgiler için alan ekleyin.')} />
{:else}
  <div class="overflow-hidden rounded-xl border bg-card">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>{t('Alan')}</Table.Head>
          <Table.Head>{t('Tür')}</Table.Head>
          <Table.Head class="hidden md:table-cell">{t('Görünürlük')}</Table.Head>
          <Table.Head class="hidden md:table-cell">{t('Nerede')}</Table.Head>
          <Table.Head></Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.fields as field (field.id)}
          <Table.Row class={field.isActive ? '' : 'opacity-50'}>
            <Table.Cell>
              <div class="grid">
                <span class="font-medium">{field.name}{#if field.isRequired}<span class="text-destructive"> *</span>{/if}</span>
                <span class="font-mono text-xs text-muted-foreground">{field.key}</span>
              </div>
            </Table.Cell>
            <Table.Cell>{t(typeLabels[field.type] ?? '')}</Table.Cell>
            <Table.Cell class="hidden md:table-cell">{t(visibilityLabels[field.visibility] ?? '')}</Table.Cell>
            <Table.Cell class="hidden text-xs text-muted-foreground md:table-cell">
              {[field.showOnRegister && t('Kayıt'), field.showInProfile && t('Profil'), field.showInPosts && t('Mesajlar')].filter(Boolean).join(', ') || '—'}
            </Table.Cell>
            <Table.Cell class="text-right">
              <Button size="sm" variant="outline" onclick={() => edit(field)}>{t('Düzenle')}</Button>
              <Button size="sm" variant="ghost" onclick={() => remove(field)}>{t('Sil')}</Button>
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
{/if}

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <Dialog.Header><Dialog.Title>{editingId ? t('Alanı düzenle') : t('Yeni alan')}</Dialog.Title></Dialog.Header>
    <form class="grid gap-3" onsubmit={save}>
      <FormMessage message={form.message} />
      <div class="grid gap-3 sm:grid-cols-2">
        <Field label={t('Görünen ad')} for="pf-name" error={form.error('name')}><Input id="pf-name" bind:value={f.name} /></Field>
        <Field label={t('Anahtar')} for="pf-key" error={form.error('key')} hint={t('örn. discord')}><Input id="pf-key" bind:value={f.key} class="font-mono" /></Field>
      </div>
      <Field label={t('Açıklama')} for="pf-desc"><Input id="pf-desc" bind:value={f.description} /></Field>
      <div class="grid gap-3 sm:grid-cols-2">
        <Field label={t('Tür')} for="pf-type">
          <NativeSelect id="pf-type" bind:value={f.type} options={Object.entries(typeLabels).map(([value, label]) => ({ value, label: t(label) }))} />
        </Field>
        <Field label={t('En fazla uzunluk')} for="pf-max"><Input id="pf-max" type="number" min="1" bind:value={f.maxLength} /></Field>
      </div>
      {#if f.type === 'select' || f.type === 'radio'}
        <Field label={t('Seçenekler (her satıra bir tane)')} for="pf-opts" error={form.error('options')}>
          <Textarea id="pf-opts" bind:value={optionsText} rows={4} />
        </Field>
      {/if}
      {#if f.type === 'text' || f.type === 'textarea'}
        <Field label={t('Düzenli ifade (isteğe bağlı)')} for="pf-re" error={form.error('regex')} hint={t('Örn. {example}', { example: '^[A-Za-z0-9_]+#\\d{4}$' })}>
          <Input id="pf-re" bind:value={f.regex} class="font-mono" />
        </Field>
      {/if}
      <div class="grid gap-3 sm:grid-cols-2">
        <Field label={t('Kimler görebilir')} for="pf-vis">
          <NativeSelect id="pf-vis" bind:value={f.visibility} options={Object.entries(visibilityLabels).map(([value, label]) => ({ value, label: t(label) }))} />
        </Field>
        <Field label={t('Kim düzenler')} for="pf-edit">
          <NativeSelect
            id="pf-edit"
            bind:value={f.editableBy}
            options={[
              { value: 'owner', label: t('Üyenin kendisi') },
              { value: 'staff', label: t('Yalnız yetkililer') },
            ]}
          />
        </Field>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <label class="flex items-center justify-between gap-2 text-sm">{t('Zorunlu')} <Switch bind:checked={f.isRequired} /></label>
        <label class="flex items-center justify-between gap-2 text-sm">{t('Kayıt formunda')} <Switch bind:checked={f.showOnRegister} /></label>
        <label class="flex items-center justify-between gap-2 text-sm">{t('Profilde göster')} <Switch bind:checked={f.showInProfile} /></label>
        <label class="flex items-center justify-between gap-2 text-sm">{t('Mesajlarda göster')} <Switch bind:checked={f.showInPosts} /></label>
        <label class="flex items-center justify-between gap-2 text-sm">{t('Etkin')} <Switch bind:checked={f.isActive} /></label>
      </div>
      <Field label={t('Sıra')} for="pf-sort"><Input id="pf-sort" type="number" bind:value={f.sortOrder} class="w-32" /></Field>
      <Dialog.Footer>
        <Button variant="ghost" onclick={() => (open = false)}>{t('Vazgeç')}</Button>
        <Button type="submit" disabled={form.submitting}>{t('Kaydet')}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
