<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/FileText';
  import { goto, invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import * as Card from '$lib/components/ui/card';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import { api, errorMessage } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { formatDate, formatNumber } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';
  import type { AdminPolicy } from './+page';

  let { data } = $props();

  let open = $state(false);
  let key = $state('');
  let title = $state('');
  let bodyMd = $state('');
  let isRequired = $state(true);
  let showOnRegister = $state(true);
  const form = createForm();

  async function create(e: SubmitEvent) {
    e.preventDefault();
    const res = await form.submit(() => api.post<{ id: number }>('/api/admin/policies', { key, title, bodyMd, isRequired, showOnRegister, sortOrder: data.policies.length + 1 }), {
      success: t('Politika oluşturuldu (taslak).'),
    });
    if (res) {
      open = false;
      await goto(`/admin/policies/${res.id}`);
    }
  }

  async function toggle(p: AdminPolicy, patch: Partial<Pick<AdminPolicy, 'isRequired' | 'showOnRegister' | 'isActive'>>) {
    try {
      await api.put(`/api/admin/policies/${p.id}`, patch);
      toast.success(t('Güncellendi.'));
      await invalidate('app:admin-policies');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<PageHeader icon={PageHeaderIcon} title={t('Politikalar')} description={t('Kullanım koşulları, gizlilik politikası ve kurallar. Yeni sürüm yayımlandığında üyelerden yeniden onay istenebilir.')}>
  {#snippet actions()}<Button size="sm" onclick={() => (open = true)}><PlusIcon />{t('Yeni politika')}</Button>{/snippet}
</PageHeader>

<div class="grid gap-4">
  {#each data.policies as p (p.id)}
    {@const current = p.versions.find((v) => v.publishedAt)}
    {@const draft = p.versions.find((v) => !v.publishedAt)}
    <Card.Root class={p.isActive ? '' : 'opacity-60'}>
      <Card.Header>
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Card.Title class="text-base">{tc(current?.title ?? draft?.title) || p.key}</Card.Title>
            <Card.Description>
              <span class="font-mono">/policies/{p.key}</span>
              {#if current} · {t('Yürürlükteki sürüm v{version} ({date})', { version: current.version, date: formatDate(current.publishedAt) })} · {t('{n} onay', { n: formatNumber(current.acceptances) })}{/if}
              {#if draft} · <span class="text-warning">{t('Taslak v{version}', { version: draft.version })}</span>{/if}
            </Card.Description>
          </div>
          <Button href="/admin/policies/{p.id}" size="sm" variant="outline">{t('Düzenle')}</Button>
        </div>
      </Card.Header>
      <Card.Content class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label class="flex items-center gap-2"><Switch checked={p.isRequired} onCheckedChange={(v) => toggle(p, { isRequired: v })} />{t('Onay zorunlu')}</label>
        <label class="flex items-center gap-2"><Switch checked={p.showOnRegister} onCheckedChange={(v) => toggle(p, { showOnRegister: v })} />{t('Kayıtta göster')}</label>
        <label class="flex items-center gap-2"><Switch checked={p.isActive} onCheckedChange={(v) => toggle(p, { isActive: v })} />{t('Etkin')}</label>
      </Card.Content>
    </Card.Root>
  {/each}
</div>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header><Dialog.Title>{t('Yeni politika')}</Dialog.Title></Dialog.Header>
    <form class="grid gap-3" onsubmit={create}>
      <FormMessage message={form.message} />
      <div class="grid gap-3 sm:grid-cols-2">
        <Field label={t('Başlık')} for="np-title" error={form.error('title')}><Input id="np-title" bind:value={title} /></Field>
        <Field label={t('Adres anahtarı')} for="np-key" error={form.error('key')} hint={t('örn. cerez-politikasi')}><Input id="np-key" bind:value={key} class="font-mono" /></Field>
      </div>
      <Field label={t('Metin')} for="np-body" error={form.error('bodyMd')}><Editor id="np-body" bind:value={bodyMd} minHeight={220} mentions={false} previewKind="short" placeholder={t('Politika metni…')} /></Field>
      <div class="flex flex-wrap gap-6 text-sm">
        <label class="flex items-center gap-2"><Switch bind:checked={isRequired} />{t('Onay zorunlu')}</label>
        <label class="flex items-center gap-2"><Switch bind:checked={showOnRegister} />{t('Kayıtta göster')}</label>
      </div>
      <p class="text-xs text-muted-foreground">{t('Politika taslak olarak oluşturulur; yayımlamak için düzenleme sayfasını kullanın.')}</p>
      <Dialog.Footer><Button type="submit" disabled={form.submitting}>{t('Oluştur')}</Button></Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
