<script lang="ts">
  import { invalidate, invalidateAll } from '$app/navigation';
  import { untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { toast } from 'svelte-sonner';
  import {
    ANNOUNCEMENT_STYLES,
    HOME_BLOCK_INFO,
    HOME_BLOCK_PLUGIN,
    pluginEnabled,
    type AdminHomeBlock,
    type AnnouncementStyle,
    type HomeBlockKind,
    type HomePosition,
    type IconNode,
  } from '@forum/shared';
  import GripIcon from 'phosphor-svelte/lib/DotsSixVertical';
  import DotsIcon from 'phosphor-svelte/lib/DotsThreeVertical';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import MegaphoneIcon from 'phosphor-svelte/lib/Megaphone';
  import SquaresIcon from 'phosphor-svelte/lib/SquaresFour';
  import TextIcon from 'phosphor-svelte/lib/TextAlignLeft';
  import CodeIcon from 'phosphor-svelte/lib/Code';
  import LightningIcon from 'phosphor-svelte/lib/Lightning';
  import ChartIcon from 'phosphor-svelte/lib/ChartLineUp';
  import BroadcastIcon from 'phosphor-svelte/lib/Broadcast';
  import CakeIcon from 'phosphor-svelte/lib/Cake';
  import DiscordIcon from 'phosphor-svelte/lib/DiscordLogo';
  import ImageIcon from 'phosphor-svelte/lib/Image';
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import CaretUpIcon from 'phosphor-svelte/lib/CaretUp';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDown';
  import ClockIcon from 'phosphor-svelte/lib/Clock';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import UsersIcon from 'phosphor-svelte/lib/Users';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import LayoutIcon from 'phosphor-svelte/lib/Layout';
  import ChatsIcon from 'phosphor-svelte/lib/ChatsCircle';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SaveBar from '$lib/components/admin/SaveBar.svelte';
  import Field from '$lib/components/Field.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import IconPicker from '$lib/components/IconPicker.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import CodeEditor from '$lib/components/CodeEditor.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { t } from '$lib/i18n.svelte';
  import { cn, type IconComponent } from '$lib/utils';

  let { data } = $props();

  type Block = AdminHomeBlock & { uid: string };
  const ICONS: Record<HomeBlockKind, IconComponent> = {
    announcement: MegaphoneIcon,
    tiles: SquaresIcon,
    text: TextIcon,
    html: CodeIcon,
    recent: LightningIcon,
    stats: ChartIcon,
    online: BroadcastIcon,
    birthdays: CakeIcon,
    discord: DiscordIcon,
  };
  const ZONES: Array<{ key: HomePosition; label: string; hint: string }> = [
    { key: 'top', label: 'Üst alan', hint: 'Kategorilerin üstünde, tam genişlik' },
    { key: 'sidebar', label: 'Yan sütun', hint: 'Sağda; boşsa kategoriler tam genişlik olur' },
    { key: 'bottom', label: 'Alt alan', hint: 'Kategorilerin altında' },
  ];
  const STYLE_LABEL: Record<AnnouncementStyle, string> = { accent: 'Tema', info: 'Bilgi', success: 'Başarı', warning: 'Uyarı', danger: 'Önemli', neutral: 'Sade' };
  const STYLE_COLOR: Record<AnnouncementStyle, string> = {
    accent: 'var(--primary)',
    info: 'oklch(0.65 0.14 240)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--destructive)',
    neutral: 'var(--muted-foreground)',
  };

  let seq = 0;
  const uid = () => `b${++seq}`;
  let zones = $state<Record<HomePosition, Block[]>>({ top: [], sidebar: [], bottom: [] });
  let snapshot = $state('');

  function serialize(): string {
    return JSON.stringify(ZONES.flatMap((z) => zones[z.key].map(({ uid: _u, updatedAt: _t, ...b }) => ({ ...b, position: z.key }))));
  }

  function sync() {
    if (!data.blocks) return;
    const next: Record<HomePosition, Block[]> = { top: [], sidebar: [], bottom: [] };
    for (const b of data.blocks) next[b.position]?.push({ ...structuredClone(b), uid: uid() });
    zones = next;
    snapshot = serialize();
  }
  sync();
  $effect.pre(() => {
    void data.blocks;
    untrack(sync);
  });

  const dirty = $derived(serialize() !== snapshot);

  function onZone(zone: HomePosition, e: CustomEvent<DndEvent<Block>>) {
    zones[zone] = e.detail.items;
  }

  function blank(kind: HomeBlockKind, position: HomePosition): Block {
    const base = { uid: uid(), id: 0, updatedAt: 0, position, title: null, visibility: 'all' as const, isEnabled: true, startsAt: null, endsAt: null };
    switch (kind) {
      case 'announcement':
        return { ...base, kind, config: { text: '', style: 'accent', icon: 'megaphone', linkUrl: null, linkLabel: null, dismissible: true } };
      case 'tiles':
        return { ...base, kind, config: { columns: 3, height: 'md', items: [{ image: null, title: '', subtitle: '', url: null, newTab: false }] } };
      case 'text':
        return { ...base, kind, config: { body: '', boxed: true } };
      case 'html':
        return { ...base, kind, config: { html: '', boxed: true } };
      case 'recent':
        return { ...base, kind, config: { limit: 5 } };
      default:
        return { ...base, kind, config: {} } as Block;
    }
  }

  let editOpen = $state(false);
  let edit = $state<Block | null>(null);
  let editIsNew = $state(false);
  let editIconNodes = $state<IconNode | null>(null);
  let editOrigin: HomePosition = 'top';

  function openNew(kind: HomeBlockKind, position: HomePosition) {
    edit = blank(kind, position);
    editOrigin = position;
    editIsNew = true;
    editIconNodes = null;
    editOpen = true;
  }
  function openEdit(b: Block) {
    edit = structuredClone($state.snapshot(b)) as Block;
    editOrigin = b.position;
    editIsNew = false;
    editIconNodes = null;
    editOpen = true;
  }
  function applyEdit(e: SubmitEvent) {
    e.preventDefault();
    if (!edit) return;
    if (edit.kind === 'announcement' && !edit.config.text.trim()) return toast.error(t('Duyuru metni gerekli.'));
    if (edit.kind === 'tiles' && !edit.config.items.length) return toast.error(t('En az bir kart ekleyin.'));
    if (editOrigin !== edit.position) zones[editOrigin] = zones[editOrigin].filter((b) => b.uid !== edit!.uid);
    const list = zones[edit.position];
    const i = list.findIndex((b) => b.uid === edit!.uid);
    if (i === -1) zones[edit.position] = [...list, edit];
    else list[i] = edit;
    editOpen = false;
  }
  function duplicate(b: Block) {
    const copy = { ...structuredClone($state.snapshot(b)), uid: uid(), id: 0 } as Block;
    const list = zones[b.position];
    zones[b.position] = [...list.slice(0, list.indexOf(b) + 1), copy, ...list.slice(list.indexOf(b) + 1)];
  }
  async function remove(b: Block) {
    if (!(await confirmAction({
        title: t('"{name}" kaldırılsın mı?', { name: b.title || t(HOME_BLOCK_INFO[b.kind].label) }),
        description: t('Kaydettiğinizde ana sayfadan kalkar.'),
        confirmLabel: t('Kaldır'),
        destructive: true,
      }))) return;
    zones[b.position] = zones[b.position].filter((x) => x.uid !== b.uid);
  }

  const toLocal = (ms: number | null) => (ms ? new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  const fromLocal = (v: string) => (v ? new Date(v).getTime() : null);

  let uploading = $state<number | null>(null);
  async function uploadTile(i: number, ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || edit?.kind !== 'tiles') return;
    uploading = i;
    try {
      const res = await api.upload<{ url: string }>('/api/admin/home/images', file, file.name);
      edit.config.items[i]!.image = res.url;
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      uploading = null;
    }
  }
  function moveTile(i: number, d: -1 | 1) {
    if (edit?.kind !== 'tiles') return;
    const items = edit.config.items;
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j]!, items[i]!];
  }

  let saving = $state(false);
  async function save() {
    saving = true;
    try {
      const blocks = ZONES.flatMap((z) =>
        zones[z.key].map(({ uid: _u, updatedAt: _t, id, ...b }) => ({ ...b, ...(id ? { id } : {}), position: z.key })),
      );
      await api.put('/api/admin/home', { blocks });
      toast.success(t('Ana sayfa düzeni kaydedildi.'));
      snapshot = serialize();
      await invalidate('app:admin-home');
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : errorMessage(e));
    } finally {
      saving = false;
    }
  }

  function summary(b: Block): string {
    switch (b.kind) {
      case 'announcement':
        return b.config.text.replace(/\[[^\]]+\]/g, '').slice(0, 90);
      case 'tiles':
        return t('{n} kart · {cols} sütun', { n: b.config.items.length, cols: b.config.columns });
      case 'text':
        return b.config.body.replace(/\[[^\]]+\]/g, '').slice(0, 90) || t('Boş içerik');
      case 'html':
        return b.config.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || t('Özel HTML kodu');
      case 'recent':
        return t('{n} konu', { n: b.config.limit });
      default:
        return t(HOME_BLOCK_INFO[b.kind].description);
    }
  }
  const HTML_HINT =
    'Betikler sayfanın güvenlik anahtarıyla çalışır; dış betik adreslerine kurulu bir eklenti izin verebilir (Yönetim → Eklentiler). {{viewer.username}} gibi değişkenler kullanılabilir.';
  const HTML_PLACEHOLDER = ['<div class="sunucu-durumu">…</div>', '<script>', '  // window.forum.viewer', '</' + 'script>'].join('\n');
  const scheduled = (b: Block) => !!(b.startsAt || b.endsAt);
  const segBtn = 'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors';
</script>

<svelte:head><title>{t('Ana sayfa düzeni · Yönetim')}</title></svelte:head>

<PageHeader
  title={t('Ana sayfa düzeni')}
  description={t('Duyurular, fotoğraflı kartlar, serbest içerik ve yan sütun bileşenlerini ekleyin; sürükleyerek bölgeler arasında taşıyın.')}
  icon={LayoutIcon}
>
  {#snippet actions()}
    <Button variant="outline" href="/" target="_blank"><ArrowSquareOutIcon />{t('Ana sayfayı aç')}</Button>
  {/snippet}
</PageHeader>

{#snippet zone(z: (typeof ZONES)[number])}
  <section class="grid min-w-0 content-start gap-2.5 rounded-2xl border border-dashed bg-muted/20 p-3" data-zone={z.key}>
    <header class="flex items-center gap-2 px-1">
      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-bold">{t(z.label)} <span class="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">{zones[z.key].length}</span></h2>
        <p class="truncate text-xs text-muted-foreground">{t(z.hint)}</p>
      </div>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}<Button {...props} variant="outline" size="sm"><PlusIcon weight="bold" />{t('Blok ekle')}</Button>{/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-72">
          {#each Object.entries(HOME_BLOCK_INFO).filter(([k]) => { const pl = HOME_BLOCK_PLUGIN[k as HomeBlockKind]; return !pl || pluginEnabled(data.viewer.settings, pl); }) as [kind, info] (kind)}
            {@const Icon = ICONS[kind as HomeBlockKind]}
            <DropdownMenu.Item onSelect={() => openNew(kind as HomeBlockKind, z.key)} class="items-start py-2">
              <Icon class="mt-0.5" />
              <span class="grid"><span class="font-semibold">{t(info.label)}</span><span class="text-xs text-muted-foreground">{t(info.description)}</span></span>
            </DropdownMenu.Item>
            {#if kind === 'html'}<DropdownMenu.Separator />{/if}
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </header>
    <div
      class="grid min-h-16 content-start gap-2 rounded-xl"
      use:dndzone={{ items: zones[z.key], flipDurationMs: 180, type: 'home', dropTargetStyle: { outline: '2px dashed var(--primary)', outlineOffset: '2px' } }}
      onconsider={(e) => onZone(z.key, e)}
      onfinalize={(e) => onZone(z.key, e)}
    >
      {#each zones[z.key] as b (b.uid)}
        {@const Icon = ICONS[b.kind]}
        <div animate:flip={{ duration: 180 }} class={cn('group flex min-w-0 items-center gap-2.5 rounded-xl border bg-card p-2.5 shadow-card', !b.isEnabled && 'opacity-55')}>
          <GripIcon class="size-4 shrink-0 cursor-grab text-muted-foreground" />
          <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon class="size-5" weight="duotone" /></span>
          <button type="button" class="min-w-0 flex-1 text-left" onclick={() => openEdit(b)}>
            <p class="flex items-center gap-1.5 truncate text-sm font-semibold">
              {b.title || t(HOME_BLOCK_INFO[b.kind].label)}
              {#if b.visibility !== 'all'}<span class="inline-flex items-center gap-0.5 rounded bg-muted px-1 text-[10px] font-bold text-muted-foreground"><UsersIcon class="size-3" />{b.visibility === 'members' ? t('Üyeler') : t('Misafirler')}</span>{/if}
              {#if scheduled(b)}<ClockIcon class="size-3.5 text-warning" aria-label={t('Tarihli')} />{/if}
              {#if !b.isEnabled}<EyeSlashIcon class="size-3.5 text-muted-foreground" aria-label={t('Kapalı')} />{/if}
            </p>
            <p class="truncate text-xs text-muted-foreground">{summary(b)}</p>
          </button>
          <Switch checked={b.isEnabled} onCheckedChange={(v) => (b.isEnabled = v)} aria-label={t('Etkin')} />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}<Button {...props} variant="ghost" size="icon-sm" aria-label={t('İşlemler')}><DotsIcon weight="bold" /></Button>{/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="w-44">
              <DropdownMenu.Item onSelect={() => openEdit(b)}><PencilIcon />{t('Düzenle')}</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => duplicate(b)}><CopyIcon />{t('Çoğalt')}</DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item variant="destructive" onSelect={() => remove(b)}><TrashIcon />{t('Kaldır')}</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      {/each}
    </div>
    {#if !zones[z.key].length}<p class="-mt-14 px-2 pb-4 text-center text-xs text-muted-foreground">{t('Blok yok. Ekleyin ya da buraya sürükleyin.')}</p>{/if}
  </section>
{/snippet}

{#if data.blocks}
  <!-- Sayfa şeması -->
  <div class="grid gap-4 pb-24">
    {@render zone(ZONES[0]!)}
    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="grid min-w-0 content-start gap-4">
        <div class="flex items-center gap-3 rounded-2xl border bg-card/60 px-4 py-5 text-sm text-muted-foreground">
          <ChatsIcon class="size-6 text-primary" weight="duotone" />
          <span><b class="text-foreground">{t('Kategoriler ve bölümler')}</b> — {t('sabit alan. Sırasını')} <a href="/admin/forum" class="font-semibold text-link hover:underline">{t('Forum yapısı')}</a> {t('ekranından değiştirin.')}</span>
        </div>
        {@render zone(ZONES[2]!)}
      </div>
      {@render zone(ZONES[1]!)}
    </div>
  </div>

  <SaveBar {dirty} {saving} onsave={save} onreset={sync} />

  <Sheet.Root bind:open={editOpen}>
    <Sheet.Content side="right" class="w-full gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
      {#if edit}
        {@const Icon = ICONS[edit.kind]}
        <form class="grid" onsubmit={applyEdit}>
          <Sheet.Header class="flex-row items-center gap-3 border-b px-5 py-4">
            <span class="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon class="size-5" weight="duotone" /></span>
            <div>
              <Sheet.Title>{editIsNew ? t('Yeni blok') : t('Bloğu düzenle')}: {t(HOME_BLOCK_INFO[edit.kind].label)}</Sheet.Title>
              <Sheet.Description>{t(HOME_BLOCK_INFO[edit.kind].description)}</Sheet.Description>
            </div>
          </Sheet.Header>

          <div class="grid gap-5 px-5 py-5">
            <Field label={t('Başlık')} hint={edit.kind === 'announcement' ? t('İsteğe bağlı; metnin üstünde kalın yazılır.') : t('Boş bırakılırsa varsayılan başlık kullanılır.')}>
              <Input
                value={edit.title ?? ''}
                oninput={(e) => edit && (edit.title = e.currentTarget.value.trim() ? e.currentTarget.value : null)}
                maxlength={80}
                placeholder={t(HOME_BLOCK_INFO[edit.kind].label)}
              />
            </Field>

            {#if edit.kind === 'announcement'}
              <Field label={t('Duyuru metni')} hint={t('BBCode desteklenir: [b]kalın[/b], [url=…]bağlantı[/url], [color=…].')}>
                <Textarea bind:value={edit.config.text} rows={3} maxlength={2000} required />
              </Field>
              <Field label={t('Renk')}>
                <div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {#each ANNOUNCEMENT_STYLES as st (st)}
                    <button
                      type="button"
                      onclick={() => edit?.kind === 'announcement' && (edit.config.style = st)}
                      class={cn('flex flex-col items-center gap-1.5 rounded-xl border p-2 text-xs font-medium transition-colors hover:bg-accent', edit.config.style === st && 'border-primary bg-primary-soft')}
                    >
                      <span class="size-5 rounded-full" style="background:{STYLE_COLOR[st]}"></span>{t(STYLE_LABEL[st])}
                    </button>
                  {/each}
                </div>
              </Field>
              <Field label={t('İkon')}><IconPicker bind:name={edit.config.icon} bind:nodes={editIconNodes} withColor={false} /></Field>
              <div class="grid gap-4 sm:grid-cols-[1fr_12rem]">
                <Field label={t('Bağlantı (isteğe bağlı)')}><Input value={edit.config.linkUrl ?? ''} oninput={(e) => edit?.kind === 'announcement' && (edit.config.linkUrl = e.currentTarget.value.trim() || null)} placeholder={t('/t/12 ya da https://…')} /></Field>
                <Field label={t('Bağlantı yazısı')}><Input value={edit.config.linkLabel ?? ''} oninput={(e) => edit?.kind === 'announcement' && (edit.config.linkLabel = e.currentTarget.value.trim() || null)} placeholder={t('Ayrıntılar')} maxlength={40} /></Field>
              </div>
              <label class="flex items-center gap-3 text-sm"><Switch bind:checked={edit.config.dismissible} />{t('Ziyaretçi kapatabilsin (içerik değişince yeniden görünür)')}</label>
            {:else if edit.kind === 'tiles'}
              <div class="grid gap-4 sm:grid-cols-2">
                <Field label={t('Sütun sayısı')}>
                  <div class="flex gap-1 rounded-lg bg-muted p-1">
                    {#each [1, 2, 3, 4] as n (n)}
                      <button type="button" class={cn(segBtn, edit.config.columns === n ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')} onclick={() => edit?.kind === 'tiles' && (edit.config.columns = n)}>{n}</button>
                    {/each}
                  </div>
                </Field>
                <Field label={t('Kart yüksekliği')}>
                  <div class="flex gap-1 rounded-lg bg-muted p-1">
                    {#each [{ v: 'sm', l: t('Kısa') }, { v: 'md', l: t('Orta') }, { v: 'lg', l: t('Uzun') }] as o (o.v)}
                      <button type="button" class={cn(segBtn, edit.config.height === o.v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')} onclick={() => edit?.kind === 'tiles' && (edit.config.height = o.v as 'sm')}>{o.l}</button>
                    {/each}
                  </div>
                </Field>
              </div>
              <div class="grid gap-3">
                {#each edit.config.items as tile, i (i)}
                  <div class="grid gap-3 rounded-xl border bg-muted/20 p-3">
                    <div class="flex gap-3">
                      <label
                        class={cn('relative flex h-24 w-36 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border bg-muted bg-cover bg-center text-muted-foreground hover:border-primary/50', uploading === i && 'pointer-events-none opacity-60')}
                        style={tile.image ? `background-image:url('${tile.image}')` : ''}
                        title={t('Görsel yükle')}
                      >
                        {#if uploading === i}<LoaderIcon class="size-5 animate-spin" />{:else if !tile.image}<span class="grid justify-items-center gap-1 text-[11px]"><ImageIcon class="size-6" />{t('Görsel yükle')}</span>{:else}<span class="absolute right-1 bottom-1 rounded-md bg-black/60 p-1 text-white"><UploadIcon class="size-3.5" /></span>{/if}
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" onchange={(e) => uploadTile(i, e)} />
                      </label>
                      <div class="grid min-w-0 flex-1 gap-2">
                        <Input bind:value={tile.title} placeholder={t('Başlık')} maxlength={60} />
                        <Input bind:value={tile.subtitle} placeholder={t('Alt yazı (isteğe bağlı)')} maxlength={120} />
                      </div>
                      <div class="flex flex-col">
                        <Button variant="ghost" size="icon-sm" disabled={i === 0} onclick={() => moveTile(i, -1)} title={t('Yukarı')}><CaretUpIcon /></Button>
                        <Button variant="ghost" size="icon-sm" disabled={i === edit.config.items.length - 1} onclick={() => moveTile(i, 1)} title={t('Aşağı')}><CaretDownIcon /></Button>
                        <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => edit?.kind === 'tiles' && (edit.config.items = edit.config.items.filter((_, k) => k !== i))} title={t('Kaldır')}><TrashIcon /></Button>
                      </div>
                    </div>
                    <div class="flex items-center gap-3">
                      <Input value={tile.url ?? ''} oninput={(e) => (tile.url = e.currentTarget.value.trim() || null)} placeholder={t('Bağlantı: /f/3 ya da https://…')} />
                      <label class="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><Switch bind:checked={tile.newTab} />{t('Yeni sekme')}</label>
                    </div>
                  </div>
                {/each}
                <Button
                  variant="outline"
                  disabled={edit.config.items.length >= 12}
                  onclick={() => edit?.kind === 'tiles' && (edit.config.items = [...edit.config.items, { image: null, title: '', subtitle: '', url: null, newTab: false }])}
                >
                  <PlusIcon />{t('Kart ekle ({n}/12)', { n: edit.config.items.length })}
                </Button>
              </div>
            {:else if edit.kind === 'text'}
              <Field label={t('İçerik')}>
                <Editor bind:value={edit.config.body} maxLength={20000} minHeight={220} mentions={false} />
              </Field>
              <label class="flex items-center gap-3 text-sm"><Switch bind:checked={edit.config.boxed} />{t('Kart içinde göster')}</label>
            {:else if edit.kind === 'html'}
              <Field label="HTML / CSS / JavaScript" hint={t(HTML_HINT)}>
                <CodeEditor bind:value={edit.config.html} maxLength={100000} minHeight={320} placeholder={HTML_PLACEHOLDER} />
              </Field>
              <label class="flex items-center gap-3 text-sm"><Switch bind:checked={edit.config.boxed} />{t('Kart içinde göster')}</label>
            {:else if edit.kind === 'recent'}
              <Field label={t('Gösterilecek konu sayısı: {n}', { n: edit.config.limit })}>
                <input type="range" min={1} max={20} bind:value={edit.config.limit} class="w-full accent-[var(--primary)]" />
              </Field>
            {/if}

            <div class="grid gap-4 border-t pt-5">
              <p class="text-xs font-bold tracking-wider text-muted-foreground uppercase">{t('Görünürlük')}</p>
              <div class="grid gap-4 sm:grid-cols-2">
                <Field label={t('Kimler görsün')}>
                  <Combobox
                    options={[
                      { value: 'all', label: t('Herkes') },
                      { value: 'members', label: t('Yalnızca üyeler') },
                      { value: 'guests', label: t('Yalnızca misafirler') },
                    ]}
                    bind:value={edit.visibility}
                  />
                </Field>
                <Field label={t('Konum')}>
                  <Combobox options={ZONES.map((z) => ({ value: z.key, label: t(z.label) }))} bind:value={edit.position} />
                </Field>
                <Field label={t('Başlangıç (isteğe bağlı)')}><Input type="datetime-local" value={toLocal(edit.startsAt)} oninput={(e) => edit && (edit.startsAt = fromLocal(e.currentTarget.value))} /></Field>
                <Field label={t('Bitiş (isteğe bağlı)')}><Input type="datetime-local" value={toLocal(edit.endsAt)} oninput={(e) => edit && (edit.endsAt = fromLocal(e.currentTarget.value))} /></Field>
              </div>
              <label class="flex items-center gap-3 text-sm"><Switch bind:checked={edit.isEnabled} />{t('Etkin')}</label>
            </div>
          </div>

          <div class="sticky bottom-0 flex justify-end gap-2 border-t bg-popover px-5 py-3">
            <Button type="button" variant="ghost" onclick={() => (editOpen = false)}>{t('Vazgeç')}</Button>
            <Button type="submit">{editIsNew ? t('Ekle') : t('Uygula')}</Button>
          </div>
        </form>
      {/if}
    </Sheet.Content>
  </Sheet.Root>
{/if}
