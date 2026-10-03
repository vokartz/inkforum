<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Trophy';
  import type { Paginated, UserSummary } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import EyeOffIcon from 'phosphor-svelte/lib/EyeSlash';
  import UsersIcon from 'phosphor-svelte/lib/Users';
  import * as Card from '$lib/components/ui/card';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import AchievementIcon from '$lib/components/AchievementIcon.svelte';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import UserPicker from '$lib/components/UserPicker.svelte';
  import { api, errorMessage } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDate, formatNumber } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';
  import type { AchievementDto } from '$lib/types';

  let { data } = $props();
  const d = $derived(data.data);

  async function refresh() {
    await invalidate('app:admin-achievements');
  }

  const grouped = $derived.by(() => {
    if (!d) return [];
    const cats = [...d.categories, { id: 0, name: t('Kategorisiz'), description: '', sortOrder: 9999 }];
    return cats.map((c) => ({ ...c, items: d.items.filter((a) => (a.categoryId ?? 0) === c.id) })).filter((c) => c.id !== 0 || c.items.length);
  });

  let open = $state(false);
  let editing = $state<AchievementDto | null>(null);
  let f = $state({
    key: '',
    name: '',
    description: '',
    categoryId: '',
    tier: 1,
    points: 10,
    isHidden: false,
    isActive: true,
    criteriaType: '',
    criteria: {} as Record<string, number | string>,
    sortOrder: 0,
  });
  const form = createForm();
  const criteriaDef = $derived(d?.criteriaTypes.find((c) => c.type === f.criteriaType));

  function edit(a: AchievementDto | null) {
    form.clear();
    editing = a;
    f = a
      ? {
          key: a.key,
          name: a.name,
          description: a.description,
          categoryId: a.categoryId ? String(a.categoryId) : '',
          tier: a.tier,
          points: a.points,
          isHidden: a.isHidden,
          isActive: a.isActive,
          criteriaType: a.criteriaType ?? '',
          criteria: { ...(a.criteria as Record<string, number>) },
          sortOrder: a.sortOrder,
        }
      : { key: '', name: '', description: '', categoryId: '', tier: 1, points: 10, isHidden: false, isActive: true, criteriaType: '', criteria: {}, sortOrder: d?.items.length ?? 0 };
    open = true;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    const criteria: Record<string, number> = {};
    for (const field of criteriaDef?.fields ?? []) criteria[field.key] = Number(f.criteria[field.key] ?? 0);
    const body = {
      key: f.key,
      name: f.name,
      description: f.description,
      categoryId: f.categoryId ? Number(f.categoryId) : null,
      tier: Number(f.tier),
      points: Number(f.points),
      isHidden: f.isHidden,
      isActive: f.isActive,
      criteriaType: f.criteriaType || null,
      criteria,
      sortOrder: Number(f.sortOrder),
    };
    const res = await form.submit(() => (editing ? api.put(`/api/admin/achievements/${editing.id}`, body) : api.post<{ id: number }>('/api/admin/achievements', body)), {
      success: t('Başarı kaydedildi.'),
    });
    if (res) {
      open = false;
      await refresh();
    }
  }

  async function remove(a: AchievementDto) {
    if (
      !(await confirmAction({
        title: t('"{name}" silinsin mi?', { name: a.name }),
        description: t('{n} üyeden de geri alınır ve puanları düşülür.', { n: a.awardedCount }),
        destructive: true,
        confirmLabel: t('Sil'),
      }))
    )
      return;
    await api.delete(`/api/admin/achievements/${a.id}`);
    toast.success(t('Başarı silindi.'));
    open = false;
    await refresh();
  }

  async function backfill(a: AchievementDto) {
    if (!(await confirmAction({ title: t('Geriye dönük dağıtım başlatılsın mı?'), description: t('Kriteri şu an sağlayan tüm üyelere arka planda verilir.') }))) return;
    try {
      await api.post(`/api/admin/achievements/${a.id}/backfill`);
      toast.success(t('Dağıtım kuyruğa alındı; birkaç dakika içinde tamamlanır.'));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  let holdersOpen = $state(false);
  let holdersOf = $state<AchievementDto | null>(null);
  let holders = $state<Paginated<{ user: UserSummary | null; awardedAt: number; source: string; reason: string | null }> | null>(null);
  let awardReason = $state('');

  async function openHolders(a: AchievementDto) {
    holdersOf = a;
    holders = null;
    holdersOpen = true;
    holders = await api.get(`/api/admin/achievements/${a.id}/holders?perPage=50`);
  }

  async function awardTo(user: UserSummary) {
    if (!holdersOf) return;
    try {
      await api.post(`/api/admin/achievements/${holdersOf.id}/award`, { userId: user.id, reason: awardReason || null });
      toast.success(t('{name} başarıyı kazandı.', { name: user.displayName }));
      awardReason = '';
      await openHolders(holdersOf);
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function revoke(userId: number) {
    if (!holdersOf) return;
    await api.delete(`/api/admin/achievements/${holdersOf.id}/holders/${userId}`);
    await openHolders(holdersOf);
    await refresh();
  }

  let catOpen = $state(false);
  let catName = $state('');
  let catDesc = $state('');
  let catId = $state<number | null>(null);
  function editCat(c: { id: number; name: string; description: string } | null) {
    catId = c?.id ?? null;
    catName = c?.name ?? '';
    catDesc = c?.description ?? '';
    catOpen = true;
  }
  async function saveCat() {
    try {
      const body = { name: catName, description: catDesc, sortOrder: d?.categories.length ?? 0 };
      if (catId) await api.put(`/api/admin/achievements/categories/${catId}`, body);
      else await api.post('/api/admin/achievements/categories', body);
      catOpen = false;
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function deleteCat(id: number) {
    if (!(await confirmAction({ title: t('Kategori silinsin mi?'), description: t('Başarılar kategorisiz kalır.'), destructive: true }))) return;
    await api.delete(`/api/admin/achievements/categories/${id}`);
    await refresh();
  }

  const tierLabel = (tier: number) => {
    const label = d?.tiers.find((x) => x.value === tier)?.label;
    return label ? t(label) : String(tier);
  };
</script>

<PageHeader icon={PageHeaderIcon} title={t('Başarılar')} description={t('Rozetler, kazanma kriterleri ve elle verilen özel başarılar.')}>
  {#snippet actions()}
    <Button variant="outline" size="sm" onclick={() => editCat(null)}>{t('Kategori ekle')}</Button>
    <Button size="sm" onclick={() => edit(null)}><PlusIcon />{t('Yeni başarı')}</Button>
  {/snippet}
</PageHeader>

{#if d}
  <div class="grid gap-8">
    {#each grouped as c (c.id)}
      <section>
        <div class="mb-3 flex items-center gap-2">
          <h2 class="text-lg font-semibold">{tc(c.name)}</h2>
          {#if c.id}
            <Button size="xs" variant="ghost" onclick={() => editCat(c)}>{t('Düzenle')}</Button>
            <Button size="xs" variant="ghost" onclick={() => deleteCat(c.id)}>{t('Sil')}</Button>
          {/if}
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          {#each c.items as a (a.id)}
            <Card.Root class={a.isActive ? '' : 'opacity-60'}>
              <Card.Content class="flex gap-3">
                <AchievementIcon iconUrl={a.iconUrl} tier={a.tier} size={52} />
                <div class="grid min-w-0 flex-1 gap-1">
                  <div class="flex items-center gap-1.5">
                    <span class="font-medium">{tc(a.name)}</span>
                    {#if a.isHidden}<EyeOffIcon class="size-3.5 text-muted-foreground" />{/if}
                  </div>
                  <p class="line-clamp-2 text-sm text-muted-foreground">{tc(a.description)}</p>
                  <p class="text-xs text-muted-foreground">
                    {tierLabel(a.tier)} · {t('{n} puan', { n: a.points })} ·
                    {a.criteriaType ? t(d.criteriaTypes.find((x) => x.type === a.criteriaType)?.label ?? a.criteriaType) : t('Elle verilir')}
                    {#each Object.entries(a.criteria) as [k, val] (k)}· {val}{/each}
                  </p>
                  <div class="mt-1 flex flex-wrap gap-1">
                    <Button size="xs" variant="outline" onclick={() => edit(a)}>{t('Düzenle')}</Button>
                    <Button size="xs" variant="ghost" onclick={() => openHolders(a)}><UsersIcon />{t('{n} sahip', { n: formatNumber(a.awardedCount) })}</Button>
                    {#if a.criteriaType}<Button size="xs" variant="ghost" onclick={() => backfill(a)}>{t('Geriye dönük dağıt')}</Button>{/if}
                  </div>
                </div>
              </Card.Content>
            </Card.Root>
          {/each}
        </div>
      </section>
    {/each}
  </div>

  <Dialog.Root bind:open>
    <Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <Dialog.Header><Dialog.Title>{editing ? t('Başarıyı düzenle') : t('Yeni başarı')}</Dialog.Title></Dialog.Header>
      <form class="grid gap-3" onsubmit={save}>
        <FormMessage message={form.message} />
        {#if editing}
          <ImageUpload
            current={editing.iconUrl}
            maxBytes={512 * 1024}
            squareSize={256}
            previewSize={64}
            label={t('İkon yükle')}
            onupload={async (blob, filename) => {
              await api.upload(`/api/admin/achievements/${editing!.id}/icon`, blob, filename);
              await refresh();
              editing = d.items.find((x) => x.id === editing!.id) ?? editing;
            }}
            onremove={async () => {
              await api.delete(`/api/admin/achievements/${editing!.id}/icon`);
              await refresh();
            }}
          />
        {/if}
        <div class="grid gap-3 sm:grid-cols-2">
          <Field label={t('Ad')} for="ac-name" error={form.error('name')}><Input id="ac-name" bind:value={f.name} /></Field>
          <Field label={t('Anahtar')} for="ac-key" error={form.error('key')} hint={t('örn. yuz-mesaj')}><Input id="ac-key" bind:value={f.key} class="font-mono" /></Field>
        </div>
        <Field label={t('Açıklama')} for="ac-desc"><Textarea id="ac-desc" bind:value={f.description} rows={2} /></Field>
        <div class="grid gap-3 sm:grid-cols-3">
          <Field label={t('Kategori')} for="ac-cat">
            <NativeSelect id="ac-cat" bind:value={f.categoryId} options={[{ value: '', label: t('Yok') }, ...d.categories.map((c) => ({ value: String(c.id), label: c.name }))]} />
          </Field>
          <Field label={t('Seviye')} for="ac-tier"><NativeSelect id="ac-tier" bind:value={f.tier} options={d.tiers.map((x) => ({ value: x.value, label: t(x.label) }))} /></Field>
          <Field label={t('Puan')} for="ac-points"><Input id="ac-points" type="number" min="0" bind:value={f.points} /></Field>
        </div>
        <Field
          label={t('Kazanma kriteri')}
          for="ac-crit"
          error={form.error('criteriaType')}
          hint={criteriaDef?.description ? t(criteriaDef.description) : t('Kriter seçilmezse yalnızca yöneticiler elle verebilir.')}
        >
          <NativeSelect id="ac-crit" bind:value={f.criteriaType} options={[{ value: '', label: t('Elle verilir') }, ...d.criteriaTypes.map((c) => ({ value: c.type, label: t(c.label) }))]} />
        </Field>
        {#each criteriaDef?.fields ?? [] as field (field.key)}
          <Field label={t(field.label)} for="ac-cf-{field.key}" error={form.error('criteria')}>
            {#if field.type === 'group'}
              <NativeSelect id="ac-cf-{field.key}" bind:value={f.criteria[field.key]} options={data.groups.map((g) => ({ value: g.id, label: g.name }))} />
            {:else}
              <Input id="ac-cf-{field.key}" type="number" min={field.min ?? 0} bind:value={f.criteria[field.key]} class="w-40" />
            {/if}
          </Field>
        {/each}
        <div class="flex flex-wrap gap-6 text-sm">
          <label class="flex items-center gap-2"><Switch bind:checked={f.isActive} />{t('Etkin')}</label>
          <label class="flex items-center gap-2"><Switch bind:checked={f.isHidden} />{t('Gizli (kazanılana kadar ayrıntı gösterilmez)')}</label>
        </div>
        <Dialog.Footer class="gap-2">
          {#if editing}<Button variant="destructive" onclick={() => remove(editing!)}>{t('Sil')}</Button>{/if}
          <Button type="submit" disabled={form.submitting}>{t('Kaydet')}</Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root bind:open={holdersOpen}>
    <Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <Dialog.Header><Dialog.Title>{t('{name} — sahipler', { name: holdersOf?.name ?? '' })}</Dialog.Title></Dialog.Header>
      <div class="grid gap-2">
        <Input bind:value={awardReason} placeholder={t('Verme gerekçesi (isteğe bağlı)')} />
        <UserPicker placeholder={t('Üyeye ver…')} onpick={awardTo} />
      </div>
      <div class="grid gap-1.5">
        {#if !holders}
          <p class="text-sm text-muted-foreground">{t('Yükleniyor…')}</p>
        {:else if !holders.items.length}
          <p class="text-sm text-muted-foreground">{t('Henüz kimse kazanmadı.')}</p>
        {:else}
          {#each holders.items as h (h.user?.id)}
            <div class="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm">
              <div class="grid">
                <UserName user={h.user} />
                <span class="text-xs text-muted-foreground">{formatDate(h.awardedAt)} · {h.source === 'manual' ? t('elle') : t('otomatik')}{#if h.reason} · {h.reason}{/if}</span>
              </div>
              {#if h.user}<Button size="xs" variant="ghost" onclick={() => revoke(h.user!.id)}>{t('Geri al')}</Button>{/if}
            </div>
          {/each}
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Root>

  <Dialog.Root bind:open={catOpen}>
    <Dialog.Content>
      <Dialog.Header><Dialog.Title>{catId ? t('Kategoriyi düzenle') : t('Yeni kategori')}</Dialog.Title></Dialog.Header>
      <div class="grid gap-3">
        <Field label={t('Ad')} for="cat-name"><Input id="cat-name" bind:value={catName} /></Field>
        <Field label={t('Açıklama')} for="cat-desc"><Input id="cat-desc" bind:value={catDesc} /></Field>
      </div>
      <Dialog.Footer><Button onclick={saveCat} disabled={!catName.trim()}>{t('Kaydet')}</Button></Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{/if}
