<script lang="ts">
  import { untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { slugify, type AdminReaction } from '@forum/shared';
  import SmileyIcon from 'phosphor-svelte/lib/Smiley';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import CaretUpIcon from 'phosphor-svelte/lib/CaretUp';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDown';
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SaveBar from '$lib/components/admin/SaveBar.svelte';
  import Emoji from '$lib/components/Emoji.svelte';
  import EmojiPicker from '$lib/components/EmojiPicker.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { formatNumber } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();

  type Row = Omit<AdminReaction, 'id'> & { id?: number; uid: string };
  let seq = 0;
  let rows = $state<Row[]>([]);
  let snapshot = $state('');
  const serialize = () => JSON.stringify(rows.map(({ uid: _u, uses: _n, ...r }) => r));

  function sync() {
    rows = (data.items ?? []).filter((r) => r.isEnabled || r.uses === 0).map((r) => ({ ...r, uid: `r${++seq}` }));
    snapshot = serialize();
  }
  sync();
  $effect.pre(() => {
    void data.items;
    untrack(sync);
  });
  const dirty = $derived(serialize() !== snapshot);

  function add() {
    rows = [...rows, { uid: `r${++seq}`, key: '', label: '', emoji: '👍', points: 1, isEnabled: true, uses: 0 }];
  }
  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
  }
  async function remove(r: Row) {
    rows = rows.filter((x) => x.uid !== r.uid);
  }

  let saving = $state(false);
  let errors = $state<Record<string, string>>({});
  async function save() {
    saving = true;
    errors = {};
    try {
      const items = rows.map(({ uid: _u, uses: _n, ...r }) => ({ ...r, key: r.key || slugify(r.label).replace(/-/g, '_').slice(0, 30) || `tepki_${Math.random().toString(36).slice(2, 6)}` }));
      await api.put('/api/admin/forum/reactions', { items });
      toast.success(t('Tepkiler kaydedildi.'));
      await invalidate('app:admin-reactions');
    } catch (e) {
      if (e instanceof ApiError) {
        errors = e.fields;
        toast.error(Object.values(e.fields)[0] ?? e.message);
      } else toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }
  const pointTone = (p: number) => (p > 0 ? 'text-success' : p < 0 ? 'text-destructive' : 'text-muted-foreground');
</script>

<PageHeader
  title={t('Tepkiler')}
  description={t('Mesajlara verilebilen emoji tepkileri. Puan, mesaj sahibinin itibarına eklenir (eksi puan itibarı düşürür). Kullanılmış bir tepkiyi kaldırırsanız geçmiş korunur, yalnızca yeni tepki verilemez.')}
  icon={SmileyIcon}
>
  {#snippet actions()}
    <Button onclick={add} disabled={rows.length >= 20}><PlusIcon weight="bold" />{t('Tepki ekle')}</Button>
  {/snippet}
</PageHeader>

{#if data.items}
  <div class="grid max-w-4xl gap-4 pb-24">
    <!-- Önizleme -->
    <div class="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-4 shadow-card">
      <span class="mr-2 text-sm font-semibold text-muted-foreground">{t('Önizleme:')}</span>
      <div class="flex items-center gap-0.5 rounded-full border bg-popover p-1.5 shadow-lift">
        {#each rows.filter((r) => r.isEnabled) as r (r.uid)}
          <span class="flex size-10 items-center justify-center rounded-full transition-transform hover:-translate-y-1 hover:scale-125" title={r.label}><Emoji emoji={r.emoji} size={28} /></span>
        {/each}
      </div>
    </div>

    <div class="overflow-hidden rounded-2xl border bg-card shadow-card">
      <div class="hidden grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)_7rem_5rem_4rem_6rem] gap-3 border-b bg-panel-header px-4 py-2.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase md:grid">
        <span>{t('Emoji')}</span><span>{t('Ad')}</span><span>{t('Anahtar')}</span><span>{t('İtibar puanı')}</span><span>{t('Kullanım')}</span><span>{t('Açık')}</span><span></span>
      </div>
      {#each rows as r, i (r.uid)}
        <div animate:flip={{ duration: 180 }} class={cn('grid items-center gap-3 border-b px-4 py-3 last:border-b-0 md:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)_7rem_5rem_4rem_6rem]', !r.isEnabled && 'opacity-60')}>
          <Popover.Root>
            <Popover.Trigger class="flex size-12 items-center justify-center rounded-xl border bg-muted/40 transition-colors hover:border-primary/50" aria-label={t('Emoji seç')}>
              <Emoji emoji={r.emoji} size={30} />
            </Popover.Trigger>
            <Popover.Content class="w-auto p-2.5" align="start">
              <EmojiPicker onpick={(e) => (r.emoji = e)} />
            </Popover.Content>
          </Popover.Root>
          <Input bind:value={r.label} placeholder={t('Ad (ör. Beğen)')} maxlength={30} aria-invalid={!!errors[`items.${i}.label`]} />
          <Input
            bind:value={r.key}
            placeholder={slugify(r.label).replace(/-/g, '_') || t('anahtar')}
            maxlength={30}
            disabled={!!r.id}
            class="font-mono text-xs"
            title={r.id ? t('Kayıtlı tepkinin anahtarı değişmez') : t('Boş bırakılırsa addan üretilir')}
            aria-invalid={!!errors[`items.${i}.key`]}
          />
          <div class="flex items-center gap-1">
            <Input type="number" min={-5} max={5} bind:value={r.points} class="w-16" />
            <span class={cn('text-xs font-bold', pointTone(r.points))}>{r.points > 0 ? '+' : ''}{r.points}</span>
          </div>
          <span class="text-sm tabular-nums text-muted-foreground">{formatNumber(r.uses)}</span>
          <Switch bind:checked={r.isEnabled} aria-label={t('Açık')} />
          <div class="flex justify-end">
            <Button variant="ghost" size="icon-sm" disabled={i === 0} onclick={() => move(i, -1)} title={t('Yukarı')}><CaretUpIcon /></Button>
            <Button variant="ghost" size="icon-sm" disabled={i === rows.length - 1} onclick={() => move(i, 1)} title={t('Aşağı')}><CaretDownIcon /></Button>
            <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => remove(r)} title={t('Kaldır')} disabled={rows.length <= 1}><TrashIcon /></Button>
          </div>
        </div>
      {/each}
    </div>
    <p class="text-xs text-muted-foreground">{t('Emojiler Twemoji (CC-BY 4.0) görselleriyle gösterilir; her cihazda aynı görünür.')}</p>
  </div>

  <SaveBar {dirty} {saving} onsave={save} onreset={sync} />
{/if}
