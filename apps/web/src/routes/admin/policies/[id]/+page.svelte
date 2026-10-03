<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/FileText';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import { api, errorMessage } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDateTime, formatNumber } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const p = $derived(data.policy);
  const latest = $derived(data.latest);
  const isDraft = $derived(!!latest && !latest.publishedAt);

  let title = $state('');
  let bodyMd = $state('');
  let requiresReacceptance = $state(true);
  let changeNote = $state('');
  function syncState1() {
    if (!latest) return;
    title = latest.title;
    bodyMd = latest.bodyMd;
    requiresReacceptance = latest.publishedAt ? true : latest.requiresReacceptance;
    changeNote = latest.publishedAt ? '' : (latest.changeNote ?? '');
  }
  syncState1();
  $effect.pre(syncState1);

  const form = createForm();

  async function saveDraft(e?: SubmitEvent) {
    e?.preventDefault();
    const body = { title, bodyMd, requiresReacceptance, changeNote: changeNote || null };
    const res = await form.submit(
      () => (isDraft ? api.put(`/api/admin/policy-versions/${latest!.id}`, body) : api.post(`/api/admin/policies/${p!.id}/versions`, body)),
      { success: t('Taslak kaydedildi.') },
    );
    if (res) await invalidate('app:admin-policy');
    return !!res;
  }

  async function publish() {
    if (!latest) return;
    const willForce = p?.isRequired && (requiresReacceptance || !p.versions.some((v) => v.publishedAt));
    if (
      !(await confirmAction({
        title: t('v{version} yayımlansın mı?', { version: latest.version }),
        description: willForce ? t('Tüm üyelerden bu sürümü yeniden onaylamaları istenecek.') : t('Yayımlandıktan sonra bu sürüm değiştirilemez.'),
        confirmLabel: t('Yayımla'),
      }))
    )
      return;
    if (!(await saveDraft())) return;
    try {
      await api.post(`/api/admin/policy-versions/${latest.id}/publish`);
      toast.success(t('Yayımlandı.'));
      await invalidate('app:admin-policy');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function discard() {
    if (!latest || !isDraft) return;
    if (!(await confirmAction({ title: t('Taslak silinsin mi?'), destructive: true, confirmLabel: t('Sil') }))) return;
    await api.delete(`/api/admin/policy-versions/${latest.id}`);
    toast.success(t('Taslak silindi.'));
    await invalidate('app:admin-policy');
  }
</script>

{#if p}
  <PageHeader icon={PageHeaderIcon} title={tc(latest?.title) || p.key} description="/policies/{p.key}">
    {#snippet actions()}
      <Button href="/admin/policies" variant="outline" size="sm">{t('Tüm politikalar')}</Button>
      <Button href="/policies/{p.key}" variant="ghost" size="sm" target="_blank">{t('Yayındaki sürümü gör')}</Button>
    {/snippet}
  </PageHeader>

  <div class="grid gap-6 lg:grid-cols-[1fr_300px]">
    <Card.Root>
      <Card.Header>
        <Card.Title class="text-base">
          {#if isDraft}{t('Taslak v{version}', { version: latest?.version })}{:else}{t('Yeni sürüm hazırla')}{/if}
        </Card.Title>
        <Card.Description>
          {#if isDraft}{t('Yayımlanana kadar üyeler bu değişiklikleri görmez.')}{:else}{t('Kaydettiğinizde yeni bir taslak sürüm oluşturulur.')}{/if}
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <form class="grid gap-4" onsubmit={saveDraft}>
          <FormMessage message={form.message} />
          <Field label={t('Başlık')} for="pv-title" error={form.error('title')}><Input id="pv-title" bind:value={title} /></Field>
          <Field label={t('Metin')} for="pv-body" error={form.error('bodyMd')}>
            <Editor id="pv-body" bind:value={bodyMd} minHeight={352} mentions={false} previewKind="short" placeholder={t('Politika metni…')} />
          </Field>
          <Field label={t('Değişiklik notu')} for="pv-note" hint={t('Üyelere onay ekranında gösterilir.')}><Input id="pv-note" bind:value={changeNote} /></Field>
          <label class="flex items-center justify-between gap-4 text-sm">
            <span>
              <span class="font-medium">{t('Yeniden onay iste')}</span>
              <span class="block text-xs text-muted-foreground">{t('Açıksa, yayımlandığında tüm üyeler bu sürümü onaylayana kadar foruma devam edemez.')}</span>
            </span>
            <Switch bind:checked={requiresReacceptance} />
          </label>
          <div class="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={form.submitting}>{t('Taslağı kaydet')}</Button>
            {#if isDraft}
              <Button onclick={publish} disabled={form.submitting}>{t('Yayımla')}</Button>
              <Button variant="ghost" onclick={discard}>{t('Taslağı sil')}</Button>
            {/if}
          </div>
        </form>
      </Card.Content>
    </Card.Root>

    <Card.Root class="h-fit">
      <Card.Header><Card.Title class="text-base">{t('Sürümler')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-2 text-sm">
        {#each p.versions as v (v.id)}
          <div class="rounded-lg border p-2">
            <div class="flex items-center justify-between">
              <span class="font-medium">v{v.version}</span>
              {#if v.publishedAt}<span class="text-xs text-success">{t('Yayında')}</span>{:else}<span class="text-xs text-warning">{t('Taslak')}</span>{/if}
            </div>
            <div class="text-xs text-muted-foreground">
              {v.publishedAt ? formatDateTime(v.publishedAt) : t('Oluşturma: {date}', { date: formatDateTime(v.createdAt) })}
              {#if v.publishedAt} · {t('{n} onay', { n: formatNumber(v.acceptances) })}{/if}
              {#if v.requiresReacceptance} · {t('yeniden onay')}{/if}
            </div>
            {#if v.changeNote}<div class="mt-1 text-xs">{v.changeNote}</div>{/if}
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  </div>
{/if}
