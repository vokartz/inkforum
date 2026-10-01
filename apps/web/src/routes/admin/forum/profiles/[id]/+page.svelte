<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Stack';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import PermissionMatrix from '$lib/components/admin/PermissionMatrix.svelte';
  import { api, errorMessage } from '$lib/api';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const m = $derived(data.matrix);

  async function save(changes: Array<{ groupId: number; values: Record<string, number> }>) {
    if (!m) return;
    try {
      for (const c of changes) await api.put(`/api/admin/forum/profiles/${m.profile.id}/values`, c);
      toast.success(t('Yetkiler kaydedildi.'));
      await invalidate('app:admin-profile');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  let renameOpen = $state(false);
  let name = $state('');
  let description = $state('');
  async function rename(e: SubmitEvent) {
    e.preventDefault();
    if (!m) return;
    try {
      await api.put(`/api/admin/forum/profiles/${m.profile.id}`, { name, description });
      renameOpen = false;
      toast.success(t('Profil güncellendi.'));
      await invalidate('app:admin-profile');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }
</script>

{#if m}
  <PageHeader icon={PageHeaderIcon} title={tc(m.profile.name)} description={tc(m.profile.description) || t('Bölüm yetki profili')}>
    {#snippet actions()}
      <Button variant="ghost" href="/admin/forum/profiles"><ArrowLeftIcon />{t('Profiller')}</Button>
      <Button
        variant="outline"
        onclick={() => {
          name = m.profile.name;
          description = m.profile.description;
          renameOpen = true;
        }}><PencilIcon />{t('Adı düzenle')}</Button
      >
    {/snippet}
    <p class="mt-2 text-xs text-muted-foreground">
      {t('Kullanan bölümler:')}
      {#if m.boards.length}
        {#each m.boards as b, i (b.id)}<a href="/admin/forum/boards/{b.id}" class="font-medium text-foreground hover:underline">{b.name}</a>{#if i < m.boards.length - 1}<span class="mr-1">,</span>{/if}{/each}
      {:else}
        {t('yok')}
      {/if}
    </p>
  </PageHeader>

  <PermissionMatrix categories={m.categories} permissions={m.permissions} groups={m.groups} values={m.values} onsave={save} />
  <p class="mt-3 text-xs text-muted-foreground">
    {t('"Moderatör" sütunu yalnızca bölüme atanmış moderatörlere uygulanır. Tüm kayıtlı üyeler "Üye" grubunun yetkilerine sahiptir.')}
  </p>

  <Dialog.Root bind:open={renameOpen}>
    <Dialog.Content class="sm:max-w-md">
      <form class="grid gap-4" onsubmit={rename}>
        <Dialog.Header><Dialog.Title>{t('Profili düzenle')}</Dialog.Title></Dialog.Header>
        <Field label={t('Ad')} for="pn"><Input id="pn" bind:value={name} maxlength={80} required /></Field>
        <Field label={t('Açıklama')} for="pd"><Input id="pd" bind:value={description} maxlength={300} /></Field>
        <Dialog.Footer>
          <Button type="button" variant="ghost" onclick={() => (renameOpen = false)}>{t('Vazgeç')}</Button>
          <Button type="submit" disabled={!name.trim()}>{t('Kaydet')}</Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>
{/if}
