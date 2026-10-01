<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Stack';
  import { goto, invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import LayersIcon from 'phosphor-svelte/lib/Stack';
  import LockIcon from 'phosphor-svelte/lib/Lock';
  import Trash2Icon from 'phosphor-svelte/lib/Trash';
  import ChevronRightIcon from 'phosphor-svelte/lib/CaretRight';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const profiles = $derived(data.profiles ?? []);

  let open = $state(false);
  let name = $state('');
  let description = $state('');
  let copyFromId = $state<number | null>(null);

  async function create(e: SubmitEvent) {
    e.preventDefault();
    try {
      const res = await api.post<{ id: number }>('/api/admin/forum/profiles', { name, description, copyFromId });
      open = false;
      toast.success(t('Profil oluşturuldu.'));
      await goto(`/admin/forum/profiles/${res.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove(id: number, n: string) {
    if (!(await confirmAction({ title: t('"{name}" profili silinsin mi?', { name: n }), description: t('Bu profili kullanan bölümler varsayılan profile döner.'), confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/admin/forum/profiles/${id}`);
      toast.success(t('Profil silindi.'));
      await invalidate('app:admin-profiles');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }
</script>

<PageHeader icon={PageHeaderIcon}
  title={t('Bölüm yetki profilleri')}
  description={t('Profiller, grupların bir bölümde neler yapabileceğini belirler (okuma, konu açma, yanıt, moderasyon). Her bölüme bir profil atanır.')}
>
  {#snippet actions()}
    <Button
      onclick={() => {
        name = '';
        description = '';
        copyFromId = null;
        open = true;
      }}><PlusIcon />{t('Yeni profil')}</Button
    >
  {/snippet}
</PageHeader>

<div class="grid gap-3">
  {#each profiles as p (p.id)}
    <div class="group flex items-center gap-4 rounded-xl border bg-card px-4 py-3 transition-shadow hover:shadow-md">
      <span class="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><LayersIcon class="size-5" /></span>
      <a href="/admin/forum/profiles/{p.id}" class="min-w-0 flex-1">
        <span class="flex items-center gap-2 font-medium">
          {tc(p.name)}
          {#if p.isSystem}<Badge variant="secondary" class="gap-1"><LockIcon class="size-3" />{t('Sistem')}</Badge>{/if}
        </span>
        {#if p.description}<span class="block truncate text-sm text-muted-foreground">{tc(p.description)}</span>{/if}
      </a>
      <span class="text-sm whitespace-nowrap text-muted-foreground">{t('{n} bölüm', { n: p.boardCount })}</span>
      {#if !p.isSystem}
        <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => remove(p.id, p.name)} title={t('Sil')}><Trash2Icon /></Button>
      {/if}
      <Button variant="ghost" size="icon-sm" href="/admin/forum/profiles/{p.id}" title={t('Düzenle')}><ChevronRightIcon /></Button>
    </div>
  {/each}
</div>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <form class="grid gap-4" onsubmit={create}>
      <Dialog.Header><Dialog.Title>{t('Yeni yetki profili')}</Dialog.Title></Dialog.Header>
      <Field label={t('Ad')} for="pf-name"><Input id="pf-name" bind:value={name} maxlength={80} required /></Field>
      <Field label={t('Açıklama')} for="pf-desc"><Input id="pf-desc" bind:value={description} maxlength={300} /></Field>
      <Field label={t('Başlangıç yetkileri')} hint={t('Seçilen profilin tüm yetkileri kopyalanır.')}>
        <Combobox options={profiles.map((p) => ({ value: p.id, label: p.name }))} bind:value={copyFromId} placeholder={t('Varsayılan profilden kopyala')} clearable />
      </Field>
      <Dialog.Footer>
        <Button type="button" variant="ghost" onclick={() => (open = false)}>{t('Vazgeç')}</Button>
        <Button type="submit" disabled={!name.trim()}>{t('Oluştur')}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
