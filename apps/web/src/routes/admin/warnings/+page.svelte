<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Warning';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import * as Card from '$lib/components/ui/card';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api, errorMessage } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDateTime } from '$lib/format';
  import { t } from '$lib/i18n.svelte';
  import type { WarningTemplate } from '$lib/types';
  import type { WarningAction } from './+page';

  let { data } = $props();

  async function refresh() {
    await invalidate('app:admin-warnings');
  }

  let tOpen = $state(false);
  let tId = $state<number | null>(null);
  let tpl = $state({ title: '', reasonTemplate: '', points: 10, expiryDays: 30 as number | '', isActive: true, sortOrder: 0 });
  const tForm = createForm();
  function editTemplate(x: WarningTemplate | null) {
    tForm.clear();
    tId = x?.id ?? null;
    tpl = x ? { ...x, expiryDays: x.expiryDays ?? '' } : { title: '', reasonTemplate: '', points: 10, expiryDays: 30, isActive: true, sortOrder: 0 };
    tOpen = true;
  }
  async function saveTemplate(e: SubmitEvent) {
    e.preventDefault();
    const body = { ...tpl, points: Number(tpl.points), expiryDays: tpl.expiryDays === '' ? null : Number(tpl.expiryDays), sortOrder: Number(tpl.sortOrder) };
    const res = await tForm.submit(() => (tId ? api.put(`/api/admin/warnings/templates/${tId}`, body) : api.post('/api/admin/warnings/templates', body)), {
      success: t('Şablon kaydedildi.'),
    });
    if (res) {
      tOpen = false;
      await refresh();
    }
  }

  let aOpen = $state(false);
  let aId = $state<number | null>(null);
  let a = $state({ thresholdPoints: 50, action: 'mute', mode: 'while_above', durationDays: '' as number | '', isActive: true, sortOrder: 0 });
  const aForm = createForm();
  function editAction(x: WarningAction | null) {
    aForm.clear();
    aId = x?.id ?? null;
    a = x
      ? { thresholdPoints: x.thresholdPoints, action: x.action, mode: x.mode, durationDays: x.durationDays ?? '', isActive: x.isActive, sortOrder: x.sortOrder }
      : { thresholdPoints: 50, action: 'mute', mode: 'while_above', durationDays: '', isActive: true, sortOrder: 0 };
    aOpen = true;
  }
  async function saveAction(e: SubmitEvent) {
    e.preventDefault();
    const body = { ...a, thresholdPoints: Number(a.thresholdPoints), durationDays: a.durationDays === '' ? null : Number(a.durationDays), sortOrder: Number(a.sortOrder) };
    const res = await aForm.submit(() => (aId ? api.put(`/api/admin/warnings/actions/${aId}`, body) : api.post('/api/admin/warnings/actions', body)), {
      success: t('Eylem kaydedildi.'),
    });
    if (res) {
      aOpen = false;
      await refresh();
    }
  }

  async function remove(kind: 'templates' | 'actions', id: number) {
    if (!(await confirmAction({ title: t('Silinsin mi?'), destructive: true, confirmLabel: t('Sil') }))) return;
    try {
      await api.delete(`/api/admin/warnings/${kind}/${id}`);
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const actionLabels: Record<string, string> = {
    watch: 'İzlemeye al',
    moderate: 'Mesajları onaya tabi tut',
    mute: 'Sustur (mesaj yazamaz)',
    temp_ban: 'Geçici yasak',
  };
</script>

<PageHeader icon={PageHeaderIcon} title={t('Uyarılar')} description={t('Uyarı puanları; eşiklere ulaşıldığında otomatik kısıtlamalar uygulanır.')} />

<Tabs.Root value={data.recent ? 'recent' : 'config'}>
  <Tabs.List>
    {#if data.recent}<Tabs.Trigger value="recent">{t('Son uyarılar')}</Tabs.Trigger>{/if}
    {#if data.config}<Tabs.Trigger value="config">{t('Şablonlar ve eşikler')}</Tabs.Trigger>{/if}
  </Tabs.List>

  {#if data.recent}
    <Tabs.Content value="recent" class="mt-4">
      {#if !data.recent.items.length}
        <EmptyState title={t('Henüz uyarı verilmemiş')} />
      {:else}
        <div class="overflow-hidden rounded-xl border bg-card">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t('Üye')}</Table.Head>
                <Table.Head>{t('Puan')}</Table.Head>
                <Table.Head>{t('Gerekçe')}</Table.Head>
                <Table.Head class="hidden md:table-cell">{t('Veren')}</Table.Head>
                <Table.Head class="hidden md:table-cell">{t('Tarih')}</Table.Head>
                <Table.Head>{t('Durum')}</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each data.recent.items as w (w.id)}
                <Table.Row>
                  <Table.Cell>{#if w.user}<a href="/admin/users/{w.user.id}"><UserName user={w.user} link={false} /></a>{/if}</Table.Cell>
                  <Table.Cell class="font-semibold text-destructive tabular-nums">{w.points}</Table.Cell>
                  <Table.Cell class="max-w-xs truncate">{w.reason}</Table.Cell>
                  <Table.Cell class="hidden md:table-cell"><UserName user={w.issuedBy} /></Table.Cell>
                  <Table.Cell class="hidden text-sm text-muted-foreground md:table-cell">{formatDateTime(w.createdAt)}</Table.Cell>
                  <Table.Cell class="text-xs">
                    {#if w.revokedAt}<span class="text-success">{t('Geri alındı')}</span>{:else if w.expiredAt}<span class="text-muted-foreground">{t('Süresi doldu')}</span>{:else}<span class="text-destructive">{t('Aktif')}</span>{/if}
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
        <Pagination page={data.recent.page} perPage={data.recent.perPage} total={data.recent.total} />
      {/if}
    </Tabs.Content>
  {/if}

  {#if data.config}
    <Tabs.Content value="config" class="mt-4 grid gap-6">
      <Card.Root>
        <Card.Header>
          <div class="flex items-center justify-between">
            <div>
              <Card.Title class="text-base">{t('Eşik eylemleri')}</Card.Title>
              <Card.Description>
                {t('"Eşiğin üzerinde kaldıkça": puan eşiğin altına inince kalkar. "Süreli": eşik aşıldığında belirtilen süre uygulanır.')}
              </Card.Description>
            </div>
            <Button size="sm" onclick={() => editAction(null)}><PlusIcon />{t('Ekle')}</Button>
          </div>
        </Card.Header>
        <Card.Content class="grid gap-2">
          {#each data.config.actions as x (x.id)}
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm {x.isActive ? '' : 'opacity-50'}">
              <span>
                <strong class="tabular-nums">{x.thresholdPoints}</strong> {t('puan')} → {t(x.actionLabel)}
                <span class="text-muted-foreground">
                  ({x.mode === 'while_above' ? t('eşiğin üzerinde kaldıkça') : x.durationDays ? t('{n} gün', { n: x.durationDays }) : t('süreli')})
                </span>
              </span>
              <span>
                <Button size="xs" variant="outline" onclick={() => editAction(x)}>{t('Düzenle')}</Button>
                <Button size="xs" variant="ghost" onclick={() => remove('actions', x.id)}>{t('Sil')}</Button>
              </span>
            </div>
          {:else}
            <p class="text-sm text-muted-foreground">{t('Eşik eylemi yok.')}</p>
          {/each}
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <div class="flex items-center justify-between">
            <div>
              <Card.Title class="text-base">{t('Uyarı şablonları')}</Card.Title>
              <Card.Description>{t('Moderatörlerin hızlıca seçebileceği hazır uyarılar.')}</Card.Description>
            </div>
            <Button size="sm" onclick={() => editTemplate(null)}><PlusIcon />{t('Ekle')}</Button>
          </div>
        </Card.Header>
        <Card.Content class="grid gap-2">
          {#each data.config.templates as x (x.id)}
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm {x.isActive ? '' : 'opacity-50'}">
              <span><strong>{x.title}</strong> · {t('{n} puan', { n: x.points })} · {x.expiryDays ? t('{n} gün', { n: x.expiryDays }) : t('süresiz')}</span>
              <span>
                <Button size="xs" variant="outline" onclick={() => editTemplate(x)}>{t('Düzenle')}</Button>
                <Button size="xs" variant="ghost" onclick={() => remove('templates', x.id)}>{t('Sil')}</Button>
              </span>
            </div>
          {:else}
            <p class="text-sm text-muted-foreground">{t('Şablon yok.')}</p>
          {/each}
        </Card.Content>
      </Card.Root>
    </Tabs.Content>
  {/if}
</Tabs.Root>

<Dialog.Root bind:open={tOpen}>
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>{tId ? t('Şablonu düzenle') : t('Yeni şablon')}</Dialog.Title></Dialog.Header>
    <form class="grid gap-3" onsubmit={saveTemplate}>
      <FormMessage message={tForm.message} />
      <Field label={t('Başlık')} for="t-title" error={tForm.error('title')}><Input id="t-title" bind:value={tpl.title} /></Field>
      <Field label={t('Gerekçe metni')} for="t-reason" error={tForm.error('reasonTemplate')}><Input id="t-reason" bind:value={tpl.reasonTemplate} /></Field>
      <div class="grid grid-cols-2 gap-3">
        <Field label={t('Puan')} for="t-points"><Input id="t-points" type="number" min="0" bind:value={tpl.points} /></Field>
        <Field label={t('Geçerlilik (gün)')} for="t-exp" hint={t('Boş = süresiz')}><Input id="t-exp" type="number" min="1" bind:value={tpl.expiryDays} /></Field>
      </div>
      <label class="flex items-center justify-between text-sm">{t('Etkin')} <Switch bind:checked={tpl.isActive} /></label>
      <Dialog.Footer><Button type="submit" disabled={tForm.submitting}>{t('Kaydet')}</Button></Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={aOpen}>
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>{aId ? t('Eylemi düzenle') : t('Yeni eşik eylemi')}</Dialog.Title></Dialog.Header>
    <form class="grid gap-3" onsubmit={saveAction}>
      <FormMessage message={aForm.message} />
      <Field label={t('Puan eşiği')} for="a-th" error={aForm.error('thresholdPoints')}><Input id="a-th" type="number" min="1" bind:value={a.thresholdPoints} /></Field>
      <Field label={t('Eylem')} for="a-act">
        <NativeSelect id="a-act" bind:value={a.action} options={Object.entries(actionLabels).map(([value, label]) => ({ value, label: t(label) }))} />
      </Field>
      <Field label={t('Uygulama biçimi')} for="a-mode" error={aForm.error('mode')}>
        <NativeSelect
          id="a-mode"
          bind:value={a.mode}
          options={[
            { value: 'while_above', label: t('Puan eşiğin üzerinde kaldıkça') },
            { value: 'timed', label: t('Eşik aşıldığında belirli süre') },
          ]}
        />
      </Field>
      {#if a.mode === 'timed'}
        <Field label={t('Süre (gün)')} for="a-dur" error={aForm.error('durationDays')}><Input id="a-dur" type="number" min="1" bind:value={a.durationDays} /></Field>
      {/if}
      <label class="flex items-center justify-between text-sm">{t('Etkin')} <Switch bind:checked={a.isActive} /></label>
      <Dialog.Footer><Button type="submit" disabled={aForm.submitting}>{t('Kaydet')}</Button></Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
