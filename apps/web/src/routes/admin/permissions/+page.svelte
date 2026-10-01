<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Key';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import MinusIcon from 'phosphor-svelte/lib/Minus';
  import XIcon from 'phosphor-svelte/lib/X';
  import TriangleAlertIcon from 'phosphor-svelte/lib/Warning';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const m = $derived(data.matrix);

  /** Düzenlenen değerler: groupId -> permission -> 1 | 0 | -1 */
  let draft = $state<Record<string, Record<string, number>>>({});
  // SSR sırasında da dolu gelmesi için hemen çalıştırılır; veri değişince yeniden eşitlenir.
  function syncState1() {
    if (!m) return;
    const next: Record<string, Record<string, number>> = {};
    for (const g of m.groups) {
      next[g.id] = {};
      for (const p of m.permissions) next[g.id]![p.key] = m.values[g.id]?.[p.key] ?? 0;
    }
    draft = next;
  }
  syncState1();
  $effect.pre(syncState1);

  const columns = $derived(m?.groups ?? []);
  let saving = $state(false);

  const changedGroups = $derived(
    m ? m.groups.filter((g) => m.permissions.some((p) => (draft[g.id]?.[p.key] ?? 0) !== (m.values[g.id]?.[p.key] ?? 0))) : [],
  );

  function cycle(groupId: number, key: string, guestBlocked: boolean) {
    const cur = draft[groupId]?.[key] ?? 0;
    let next = cur === 0 ? 1 : cur === 1 ? -1 : 0;
    if (next === 1 && guestBlocked) next = -1;
    draft[groupId]![key] = next;
  }

  async function save() {
    if (!m) return;
    saving = true;
    try {
      for (const g of changedGroups) {
        const values: Record<string, number> = {};
        for (const p of m.permissions) {
          const v = draft[g.id]?.[p.key] ?? 0;
          if (v !== (m.values[g.id]?.[p.key] ?? 0)) values[p.key] = v;
        }
        await api.put(`/api/admin/permissions/${g.id}`, { values });
      }
      toast.success(t('Yetkiler kaydedildi.'));
      await invalidate('app:admin-permissions');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }

  let copyFrom = $state('');
  let copyTo = $state('');
  async function copy() {
    if (!copyFrom || !copyTo || !m) return;
    const from = m.groups.find((g) => String(g.id) === copyFrom)?.name;
    const to = m.groups.find((g) => String(g.id) === copyTo)?.name;
    if (!(await confirmAction({ title: t('"{from}" yetkileri "{to}" grubuna kopyalansın mı?', { from, to }), description: t('Hedef grubun mevcut yetkilerinin üzerine yazılır.') }))) return;
    try {
      await api.post(`/api/admin/permissions/${copyTo}/copy`, { fromGroupId: Number(copyFrom) });
      toast.success(t('Yetkiler kopyalandı.'));
      await invalidate('app:admin-permissions');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<PageHeader icon={PageHeaderIcon}
  title={t('Yetkiler')}
  description={t('Her hücreye tıklayarak İzin → Yasak → Ayarsız arasında geçiş yapın. Yasak her zaman kazanır; Yönetici grubu tüm yetkilere sahiptir.')}
>
  {#snippet actions()}
    <Button onclick={save} disabled={saving || !changedGroups.length}>
      {saving ? t('Kaydediliyor…') : changedGroups.length ? t('Kaydet ({n} grup)', { n: changedGroups.length }) : t('Kaydet')}
    </Button>
  {/snippet}
</PageHeader>

{#if m}
  <div class="mb-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
    <span class="inline-flex items-center gap-1"><span class="flex size-5 items-center justify-center rounded bg-success/20 text-success"><CheckIcon class="size-3.5" /></span>{t('İzin')}</span>
    <span class="inline-flex items-center gap-1"><span class="flex size-5 items-center justify-center rounded bg-destructive/15 text-destructive"><XIcon class="size-3.5" /></span>{t('Yasak')}</span>
    <span class="inline-flex items-center gap-1"><span class="flex size-5 items-center justify-center rounded bg-muted"><MinusIcon class="size-3.5" /></span>{t('Ayarsız')}</span>
    <span class="ml-auto flex flex-wrap items-center gap-2">
      <NativeSelect bind:value={copyFrom} class="w-44" options={[{ value: '', label: t('Kaynak grup…') }, ...m.groups.map((g) => ({ value: String(g.id), label: g.name }))]} />
      <span>→</span>
      <NativeSelect bind:value={copyTo} class="w-44" options={[{ value: '', label: t('Hedef grup…') }, ...m.groups.filter((g) => g.editable).map((g) => ({ value: String(g.id), label: g.name }))]} />
      <Button size="sm" variant="outline" disabled={!copyFrom || !copyTo || copyFrom === copyTo} onclick={copy}>{t('Kopyala')}</Button>
    </span>
  </div>

  <div class="overflow-auto rounded-xl border bg-card">
    <table class="w-full border-collapse text-sm">
      <thead class="sticky top-0 z-10 bg-card">
        <tr class="border-b">
          <th class="sticky left-0 z-20 min-w-72 bg-card px-3 py-2 text-left font-medium">{t('Yetki')}</th>
          {#each columns as g (g.id)}
            <th class="min-w-24 px-2 py-2 text-center text-xs font-medium" style={g.color ? `color:${g.color}` : undefined}>
              {g.name}
              {#if g.inheritsFrom}<span class="block font-normal text-muted-foreground">{t('(miras)')}</span>{/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each m.categories as cat (cat.key)}
          <tr class="bg-muted/50">
            <td colspan={columns.length + 1} class="sticky left-0 px-3 py-1.5 text-xs font-semibold tracking-wide uppercase">{t(cat.label)}</td>
          </tr>
          {#each m.permissions.filter((p) => p.category === cat.key) as p (p.key)}
            <tr class="border-b last:border-b-0 hover:bg-accent/30">
              <td class="sticky left-0 bg-card px-3 py-1.5">
                <span class="flex items-center gap-1.5">
                  {#if p.dangerous}<TriangleAlertIcon class="size-3.5 shrink-0 text-warning" />{/if}
                  {t(p.label)}
                </span>
                <span class="font-mono text-[11px] text-muted-foreground">{p.key}</span>
              </td>
              {#each columns as g (g.id)}
                {@const value = draft[g.id]?.[p.key] ?? 0}
                {@const blocked = g.systemKey === 'guest' && !p.guestGrantable}
                <td class="px-2 py-1 text-center">
                  {#if g.systemKey === 'admin'}
                    <span class="inline-flex size-7 items-center justify-center rounded bg-success/10 text-success/60"><CheckIcon class="size-4" /></span>
                  {:else if !g.editable}
                    <span
                      class="inline-flex size-7 items-center justify-center rounded opacity-50 {value === 1 ? 'bg-success/20 text-success' : value === -1 ? 'bg-destructive/15 text-destructive' : 'bg-muted'}"
                    >
                      {#if value === 1}<CheckIcon class="size-4" />{:else if value === -1}<XIcon class="size-4" />{:else}<MinusIcon class="size-4" />{/if}
                    </span>
                  {:else}
                    <button
                      type="button"
                      class="inline-flex size-7 items-center justify-center rounded transition-colors {value === 1
                        ? 'bg-success/20 text-success hover:bg-success/30'
                        : value === -1
                          ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
                          : 'bg-muted text-muted-foreground hover:bg-accent'} {value !== (m.values[g.id]?.[p.key] ?? 0) ? 'ring-2 ring-primary' : ''}"
                      title={blocked ? t('Bu yetki misafirlere verilemez') : undefined}
                      onclick={() => cycle(g.id, p.key, blocked)}
                      aria-label="{g.name}: {t(p.label)}"
                    >
                      {#if value === 1}<CheckIcon class="size-4" />{:else if value === -1}<XIcon class="size-4" />{:else}<MinusIcon class="size-4" />{/if}
                    </button>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </div>
  <p class="mt-3 text-xs text-muted-foreground">
    {t('Tüm kayıtlı üyeler "Üye" grubunun yetkilerine sahiptir; diğer gruplar bunlara eklenir. Mesaj rütbeleri de yetki verebilir.')}
  </p>
{/if}
