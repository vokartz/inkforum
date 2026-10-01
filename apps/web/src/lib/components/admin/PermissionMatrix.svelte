<script lang="ts" module>
  export interface MatrixPermission {
    key: string;
    category: string;
    label: string;
    description: string | null;
    guestGrantable: boolean;
    dangerous: boolean;
  }
  export interface MatrixGroup {
    id: number;
    name: string;
    color: string | null;
    systemKey: string | null;
    editable: boolean;
    inheritsFrom: number | null;
  }
</script>

<script lang="ts">
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import MinusIcon from 'phosphor-svelte/lib/Minus';
  import XIcon from 'phosphor-svelte/lib/X';
  import TriangleAlertIcon from 'phosphor-svelte/lib/Warning';
  import SaveIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import { fly } from 'svelte/transition';
  import { Button } from '$lib/components/ui/button';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    categories: Array<{ key: string; label: string; description?: string }>;
    permissions: MatrixPermission[];
    groups: MatrixGroup[];
    values: Record<string, Record<string, number>>;
    onsave: (changes: Array<{ groupId: number; values: Record<string, number> }>) => Promise<void>;
  }
  let { categories, permissions, groups, values, onsave }: Props = $props();

  let draft = $state<Record<string, Record<string, number>>>({});
  function syncState1() {
    const next: Record<string, Record<string, number>> = {};
    for (const g of groups) {
      next[g.id] = {};
      for (const p of permissions) next[g.id]![p.key] = values[g.id]?.[p.key] ?? 0;
    }
    draft = next;
  }
  syncState1();
  $effect.pre(syncState1);

  const changes = $derived(
    groups
      .map((g) => {
        const v: Record<string, number> = {};
        for (const p of permissions) {
          const cur = draft[g.id]?.[p.key] ?? 0;
          if (cur !== (values[g.id]?.[p.key] ?? 0)) v[p.key] = cur;
        }
        return { groupId: g.id, values: v };
      })
      .filter((c) => Object.keys(c.values).length),
  );
  let saving = $state(false);

  function cycle(groupId: number, key: string, guestBlocked: boolean) {
    const cur = draft[groupId]?.[key] ?? 0;
    let next = cur === 0 ? 1 : cur === 1 ? -1 : 0;
    if (next === 1 && guestBlocked) next = -1;
    draft[groupId]![key] = next;
  }

  /** Bir satırın tamamını (tüm düzenlenebilir gruplar için) ayarlar. */
  function setRow(key: string, v: number) {
    for (const g of groups) {
      if (!g.editable || g.systemKey === 'admin') continue;
      const blocked = g.systemKey === 'guest' && !permissions.find((p) => p.key === key)?.guestGrantable;
      draft[g.id]![key] = v === 1 && blocked ? 0 : v;
    }
  }

  async function save() {
    saving = true;
    try {
      await onsave(changes);
    } finally {
      saving = false;
    }
  }
</script>

<div class="mb-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
  <span class="inline-flex items-center gap-1"><span class="flex size-5 items-center justify-center rounded bg-success/20 text-success"><CheckIcon class="size-3.5" /></span>{t('İzin')}</span>
  <span class="inline-flex items-center gap-1"><span class="flex size-5 items-center justify-center rounded bg-destructive/15 text-destructive"><XIcon class="size-3.5" /></span>{t('Yasak')}</span>
  <span class="inline-flex items-center gap-1"><span class="flex size-5 items-center justify-center rounded bg-muted"><MinusIcon class="size-3.5" /></span>{t('Ayarsız')}</span>
  <span>{t('Hücrelere tıklayarak değiştirin. Yasak her zaman kazanır.')}</span>
</div>

<div class="overflow-auto rounded-xl border bg-card" data-part="permission-matrix">
  <table class="w-full border-collapse text-sm">
    <thead class="sticky top-0 z-10 bg-card">
      <tr class="border-b">
        <th class="sticky left-0 z-20 min-w-72 bg-card px-3 py-2 text-left font-medium">{t('Yetki')}</th>
        {#each groups as g (g.id)}
          <th class="min-w-24 px-2 py-2 text-center text-xs font-medium" style={g.color ? `color:${g.color}` : undefined}>
            {g.name}
            {#if g.inheritsFrom}<span class="block font-normal text-muted-foreground">{t('(miras)')}</span>{/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each categories as cat (cat.key)}
        <tr class="bg-muted/50">
          <td colspan={groups.length + 1} class="sticky left-0 px-3 py-1.5 text-xs font-semibold tracking-wide uppercase">{t(cat.label)}</td>
        </tr>
        {#each permissions.filter((p) => p.category === cat.key) as p (p.key)}
          <tr class="group/row border-b last:border-b-0 hover:bg-accent/30">
            <td class="sticky left-0 bg-card px-3 py-1.5">
              <span class="flex items-center gap-1.5">
                {#if p.dangerous}<TriangleAlertIcon class="size-3.5 shrink-0 text-warning" />{/if}
                <span title={p.description ? t(p.description) : undefined}>{t(p.label)}</span>
                <span class="ml-auto hidden gap-0.5 group-hover/row:flex">
                  <button type="button" class="rounded p-0.5 text-success hover:bg-success/15" title={t('Tümüne izin ver')} onclick={() => setRow(p.key, 1)}><CheckIcon class="size-3.5" /></button>
                  <button type="button" class="rounded p-0.5 text-muted-foreground hover:bg-muted" title={t('Tümünü ayarsız yap')} onclick={() => setRow(p.key, 0)}><MinusIcon class="size-3.5" /></button>
                </span>
              </span>
              <span class="font-mono text-[11px] text-muted-foreground">{p.key}</span>
            </td>
            {#each groups as g (g.id)}
              {@const value = draft[g.id]?.[p.key] ?? 0}
              {@const blocked = g.systemKey === 'guest' && !p.guestGrantable}
              <td class="px-2 py-1 text-center">
                {#if g.systemKey === 'admin'}
                  <span class="inline-flex size-7 items-center justify-center rounded bg-success/10 text-success/60"><CheckIcon class="size-4" /></span>
                {:else if !g.editable}
                  <span class="inline-flex size-7 items-center justify-center rounded opacity-50 {value === 1 ? 'bg-success/20 text-success' : value === -1 ? 'bg-destructive/15 text-destructive' : 'bg-muted'}">
                    {#if value === 1}<CheckIcon class="size-4" />{:else if value === -1}<XIcon class="size-4" />{:else}<MinusIcon class="size-4" />{/if}
                  </span>
                {:else}
                  <button
                    type="button"
                    class="inline-flex size-7 items-center justify-center rounded transition-all active:scale-90 {value === 1
                      ? 'bg-success/20 text-success hover:bg-success/30'
                      : value === -1
                        ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
                        : 'bg-muted text-muted-foreground hover:bg-accent'} {value !== (values[g.id]?.[p.key] ?? 0) ? 'ring-2 ring-primary' : ''}"
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

{#if changes.length}
  <div transition:fly={{ y: 24, duration: 200 }} class="sticky bottom-4 z-20 mt-4 flex items-center gap-3 rounded-xl border bg-popover px-4 py-2.5 shadow-lg">
    <span class="text-sm">{t('{n} grupta kaydedilmemiş değişiklik var.', { n: changes.length })}</span>
    <Button variant="ghost" size="sm" class="ml-auto" onclick={syncState1}>{t('Vazgeç')}</Button>
    <Button size="sm" onclick={save} disabled={saving}>{#if saving}<LoaderIcon class="animate-spin" />{:else}<SaveIcon />{/if}{t('Kaydet')}</Button>
  </div>
{/if}
