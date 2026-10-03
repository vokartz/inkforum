<script lang="ts">
  import { TICKET_AUTO_ASSIGN, TICKET_AUTO_ASSIGN_LABELS, TICKET_PRIORITIES, TICKET_PRIORITY_LABELS, type AdminTicketCategory, type TicketCategoryInput, type UserSummary } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/Lifebuoy';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import TrayIcon from 'phosphor-svelte/lib/Tray';
  import GearIcon from 'phosphor-svelte/lib/GearSix';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import UsersIcon from 'phosphor-svelte/lib/UsersThree';
  import ShuffleIcon from 'phosphor-svelte/lib/ArrowsClockwise';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import IconPicker from '$lib/components/IconPicker.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { cn } from '$lib/utils';
  import { localeTag, t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const groupName = (id: number) => tc(data.groups.find((g) => g.id === id)?.name) || `#${id}`;
  const staffGroups = $derived(data.groups.filter((g) => g.systemKey !== 'guest' && g.systemKey !== 'member'));

  const COLORS = ['#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#ec4899', '#64748b'];
  const blank = (): TicketCategoryInput => ({ name: '', description: '', icon: 'lifebuoy', color: '#3b82f6', handlerGroupIds: [], isActive: true, sortOrder: (data.items?.length ?? 0) + 1, defaultPriority: 'normal', intro: '', autoAssign: 'none', autoAssignUserId: null, autoAssignOnline: false });
  let open = $state(false);
  let editId = $state<number | null>(null);
  let form = $state<TicketCategoryInput>(blank());
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);

  function edit(c: AdminTicketCategory | null) {
    editId = c?.id ?? null;
    handlersKey = '';
    form = c ? { name: c.name, description: c.description, icon: c.icon, color: c.color, handlerGroupIds: [...c.handlerGroupIds], isActive: c.isActive, sortOrder: c.sortOrder, defaultPriority: c.defaultPriority, intro: c.intro, autoAssign: c.autoAssign, autoAssignUserId: c.autoAssignUserId, autoAssignOnline: c.autoAssignOnline } : blank();
    errors = {};
    open = true;
  }
  let handlers = $state<UserSummary[]>([]);
  let handlersKey = '';
  $effect(() => {
    if (!open || form.autoAssign !== 'fixed') return;
    const key = form.handlerGroupIds.join(',');
    if (key === handlersKey) return;
    handlersKey = key;
    api
      .get<{ items: UserSummary[] }>(`/api/admin/ticket-categories/handlers?groups=${key}`)
      .then((r) => {
        if (handlersKey === key) handlers = r.items;
      })
      .catch(() => (handlers = []));
  });
  const assigneeName = (c: AdminTicketCategory) => (c.autoAssign === 'fixed' && c.autoAssignUser ? c.autoAssignUser.displayName : t(TICKET_AUTO_ASSIGN_LABELS[c.autoAssign].label));

  async function save() {
    saving = true;
    errors = {};
    try {
      if (editId) await api.put(`/api/admin/ticket-categories/${editId}`, form);
      else await api.post('/api/admin/ticket-categories', form);
      toast.success(t('Kategori kaydedildi.'));
      open = false;
      await invalidate('app:admin-tickets');
    } catch (e) {
      if (e instanceof ApiError) {
        errors = e.fields;
        toast.error(Object.values(e.fields)[0] ?? e.message);
      } else toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }
  async function remove(c: AdminTicketCategory) {
    if (!(await confirmAction({ title: t('"{name}" silinsin mi?', { name: c.name }), confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/admin/ticket-categories/${c.id}`);
      toast.success(t('Kategori silindi.'));
      await invalidate('app:admin-tickets');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<svelte:head><title>{t('Destek kategorileri · Yönetim')}</title></svelte:head>

<PageHeader icon={PageHeaderIcon} title={t('Destek kategorileri')} description={t('Üyelerin talep açarken seçtiği konular ve her konudan sorumlu yetkili grupları.')}>
  {#snippet actions()}
    <Button variant="ghost" href="/admin/settings/tickets"><GearIcon />{t('Ayarlar')}</Button>
    <Button variant="outline" href="/tickets/desk"><TrayIcon />{t('Destek masası')}</Button>
    <Button onclick={() => edit(null)}><PlusIcon weight="bold" />{t('Kategori ekle')}</Button>
  {/snippet}
</PageHeader>

{#if data.items}
  <div class="grid gap-3 md:grid-cols-2">
    {#each data.items as c (c.id)}
      <article class={cn('flex gap-3 rounded-xl border bg-card p-4', !c.isActive && 'opacity-60')}>
        <span class="flex size-11 shrink-0 items-center justify-center rounded-xl text-lg" style="background:color-mix(in oklch, {c.color ?? 'var(--primary)'} 15%, transparent);color:{c.color ?? 'var(--primary)'}"><PageHeaderIcon class="size-5" weight="duotone" /></span>
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 font-bold">{tc(c.name)}{#if !c.isActive}<EyeSlashIcon class="size-4 text-muted-foreground" />{/if}</p>
          {#if c.description}<p class="text-sm text-muted-foreground">{tc(c.description)}</p>{/if}
          <p class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <UsersIcon class="size-3.5 text-muted-foreground" />
            {#each c.handlerGroupIds as g (g)}<span class="rounded-full bg-muted px-2 py-0.5 font-semibold">{groupName(g)}</span>{:else}<span class="text-warning">{t('Sorumlu grup yok (yöneticiler görür)')}</span>{/each}
          </p>
          {#if c.autoAssign !== 'none'}
            <p class="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-highlight">
              <ShuffleIcon class="size-3.5" />{t('Otomatik atama: {mode}', { mode: assigneeName(c) })}{#if c.autoAssignOnline}<span class="font-normal opacity-80">· {t('önce çevrimiçi')}</span>{/if}
            </p>
          {/if}
          <p class="mt-1.5 text-xs text-muted-foreground">{t('{open} açık · {total} toplam · varsayılan öncelik {priority}', { open: c.openCount, total: c.totalCount, priority: t(TICKET_PRIORITY_LABELS[c.defaultPriority]).toLocaleLowerCase(localeTag()) })}</p>
        </div>
        <div class="flex flex-col gap-1">
          <Button variant="ghost" size="icon-sm" onclick={() => edit(c)} title={t('Düzenle')}><PencilIcon /></Button>
          <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => remove(c)} disabled={c.totalCount > 0} title={c.totalCount ? t('Talep içeren kategori silinemez; pasif yapın') : t('Sil')}><TrashIcon /></Button>
        </div>
      </article>
    {/each}
  </div>
{/if}

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header><Dialog.Title>{editId ? t('Kategoriyi düzenle') : t('Yeni kategori')}</Dialog.Title></Dialog.Header>
    <div class="grid gap-4">
      <div class="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
        <Field label={t('İkon')}><IconPicker bind:name={form.icon} withColor={false} /></Field>
        <Field label={t('Ad')} error={errors.name}><Input bind:value={form.name} maxlength={80} class="h-11" /></Field>
      </div>
      <Field label={t('Açıklama')}><Input bind:value={form.description} maxlength={300} /></Field>
      <Field label={t('Renk')}>
        <div class="flex flex-wrap gap-2">
          {#each COLORS as col (col)}<button type="button" class={cn('size-7 rounded-full transition-transform hover:scale-110', form.color === col && 'ring-2 ring-ring ring-offset-2 ring-offset-background')} style="background:{col}" onclick={() => (form.color = col)} aria-label={col}></button>{/each}
        </div>
      </Field>
      <Field label={t('Sorumlu yetkili grupları')} hint={t('Bu kategorideki talepleri bu gruplardaki üyeler görür, yanıtlar ve bildirim alır.')}>
        <div class="flex flex-wrap gap-1.5">
          {#each staffGroups as g (g.id)}
            <button type="button" onclick={() => (form.handlerGroupIds = form.handlerGroupIds.includes(g.id) ? form.handlerGroupIds.filter((x) => x !== g.id) : [...form.handlerGroupIds, g.id])} class={cn('rounded-full border px-3 py-1 text-xs font-semibold', form.handlerGroupIds.includes(g.id) ? 'border-primary bg-primary-soft text-highlight' : 'hover:bg-accent')}>{tc(g.name)}</button>
          {/each}
        </div>
      </Field>
      <Field label={t('Otomatik yetkili atama')} hint={t('Yeni talepler açıldığı anda bir yetkiliye atanır ve yalnızca o kişiye bildirim gider.')} error={errors.autoAssignUserId}>
        <div class="grid gap-2 sm:grid-cols-2" role="radiogroup">
          {#each TICKET_AUTO_ASSIGN as m (m)}
            <button
              type="button"
              role="radio"
              aria-checked={form.autoAssign === m}
              onclick={() => (form.autoAssign = m)}
              class={cn('rounded-lg border p-3 text-left transition-colors', form.autoAssign === m ? 'border-primary bg-primary-soft' : 'hover:bg-accent')}
            >
              <span class={cn('block text-sm font-semibold', form.autoAssign === m && 'text-highlight')}>{t(TICKET_AUTO_ASSIGN_LABELS[m].label)}</span>
              <span class="mt-0.5 block text-xs text-muted-foreground">{t(TICKET_AUTO_ASSIGN_LABELS[m].description)}</span>
            </button>
          {/each}
        </div>
        {#if form.autoAssign === 'fixed'}
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#each handlers as u (u.id)}
              <button
                type="button"
                onclick={() => (form.autoAssignUserId = u.id)}
                class={cn('inline-flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-xs font-semibold', form.autoAssignUserId === u.id ? 'border-primary bg-primary-soft text-highlight' : 'hover:bg-accent')}
              ><UserAvatar user={u} size={20} />{u.displayName}</button>
            {:else}
              <p class="text-xs text-warning">{t('Seçili sorumlu gruplarda üye yok.')}</p>
            {/each}
          </div>
        {/if}
        {#if form.autoAssign === 'round_robin' || form.autoAssign === 'least_open'}
          <label class="mt-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
            <span><span class="font-semibold">{t('Önce çevrimiçi yetkililer')}</span><span class="block text-xs text-muted-foreground">{t('Son 15 dakikada aktif olan yetkili varsa talep ona verilir.')}</span></span>
            <Switch bind:checked={form.autoAssignOnline} />
          </label>
        {/if}
      </Field>
      <div class="grid grid-cols-2 gap-3">
        <Field label={t('Varsayılan öncelik')}>
          <select bind:value={form.defaultPriority} class="h-9 rounded-md border bg-background px-2 text-sm">
            {#each TICKET_PRIORITIES as p (p)}<option value={p}>{t(TICKET_PRIORITY_LABELS[p])}</option>{/each}
          </select>
        </Field>
        <Field label={t('Sıra')}><Input type="number" bind:value={form.sortOrder} min={0} /></Field>
      </div>
      <Field label={t('Talep formundaki bilgi')} hint={t("Örn. 'Şikayet için ekran görüntüsü ekleyin.'")}>
        <Editor bind:value={form.intro} minHeight={110} maxLength={5000} mentions={false} compact />
      </Field>
      <label class="flex items-center justify-between text-sm font-semibold">{t('Etkin (üyeler seçebilir)')} <Switch bind:checked={form.isActive} /></label>
    </div>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (open = false)}>{t('Vazgeç')}</Button>
      <Button onclick={save} disabled={saving || !form.name.trim()}>{#if saving}<LoaderIcon class="animate-spin" />{/if}{t('Kaydet')}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
