<script lang="ts">
  import {
    BUILDER_BLOCKS,
    PAGE_LAYOUTS,
    PAGE_LAYOUT_INFO,
    builderDocSchema,
    defaultBlock,
    newBlockId,
    type AdminCustomPage,
    type BuilderBlock,
    type BuilderBlockType,
    type PageFormat,
    type PageInput,
    type ResolvedBlock,
  } from '@forum/shared';
  import { untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { toast } from 'svelte-sonner';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import MonitorIcon from 'phosphor-svelte/lib/Monitor';
  import TabletIcon from 'phosphor-svelte/lib/DeviceTablet';
  import PhoneIcon from 'phosphor-svelte/lib/DeviceMobile';
  import FloppyIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import DotsSixIcon from 'phosphor-svelte/lib/DotsSixVertical';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import CursorClickIcon from 'phosphor-svelte/lib/CursorClick';
  import SquaresIcon from 'phosphor-svelte/lib/SquaresFour';
  import GearIcon from 'phosphor-svelte/lib/GearSix';
  import CodeIcon from 'phosphor-svelte/lib/Code';
  import LayoutIcon from 'phosphor-svelte/lib/Layout';
  import TextIcon from 'phosphor-svelte/lib/TextAa';
  import HouseIcon from 'phosphor-svelte/lib/House';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import SparkleIcon from 'phosphor-svelte/lib/Sparkle';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import Field from '$lib/components/Field.svelte';
  import CodeEditor from '$lib/components/CodeEditor.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import VisibilityField from '$lib/components/admin/VisibilityField.svelte';
  import ElevationGate from '$lib/components/admin/ElevationGate.svelte';
  import BlockInspector from '$lib/components/builder/BlockInspector.svelte';
  import { BLOCK_GROUPS, BLOCK_ICONS } from '$lib/components/builder/icons';
  import { BUILDER_TEMPLATES } from '$lib/components/builder/templates';
  import { STUDIO_MSG, type FromFrame, type ToFrame } from '$lib/components/builder/studio';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { previewBBCode } from '$lib/bbcode';
  import { confirmAction } from '$lib/confirm.svelte';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';

  let { data } = $props();

  // ---------- Sayfa formu ----------
  const EMPTY: PageInput = { slug: '', title: '', format: 'builder', body: '', layout: 'blank', showTitle: true, metaDescription: null, visibility: 'all', groupIds: [], isPublished: false };
  const pick = (p: AdminCustomPage): PageInput => {
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = p;
    return { ...rest, groupIds: [...rest.groupIds] };
  };
  let form = $state<PageInput>(untrack(() => (data.page ? pick(data.page) : { ...EMPTY })));
  let snapshot = $state(untrack(() => JSON.stringify(form)));
  const dirty = $derived(JSON.stringify(form) !== snapshot);
  let slugTouched = $state(untrack(() => !!data.page));
  const locked = $derived(!data.canCode && data.page?.format === 'html');

  // ---------- Bloklar (format = builder) ----------
  function parseDoc(body: string) {
    try {
      return builderDocSchema.parse(JSON.parse(body || '{"blocks":[]}'));
    } catch {
      return builderDocSchema.parse({ blocks: [] });
    }
  }
  let blocks = $state<BuilderBlock[]>(untrack(() => parseDoc(form.body).blocks));
  let pageCss = $state(untrack(() => parseDoc(form.body).css));
  let selectedId = $state<string | null>(null);
  const selIndex = $derived(blocks.findIndex((b) => b.id === selectedId));
  // Blok değişikliği → gövde JSON
  $effect(() => {
    if (form.format !== 'builder') return;
    const json = JSON.stringify({ version: 1, blocks: $state.snapshot(blocks), css: pageCss });
    untrack(() => {
      if (json !== form.body) form.body = json;
    });
  });
  // İlk yüklemede normalleştirilmiş JSON "değişiklik" sayılmasın
  $effect.pre(() => {
    untrack(() => {
      if (form.format === 'builder') {
        form.body = JSON.stringify({ version: 1, blocks: $state.snapshot(blocks), css: pageCss });
        snapshot = JSON.stringify(form);
      }
    });
  });

  // Biçim değişince önceki içerik saklanır
  const stash: Partial<Record<PageFormat, string>> = {};
  function setFormat(f: PageFormat) {
    if (f === form.format) return;
    stash[form.format] = form.body;
    form.format = f;
    form.body = stash[f] ?? (data.page?.format === f ? data.page.body : '');
    if (f === 'builder') {
      const doc = parseDoc(form.body);
      blocks = doc.blocks;
      pageCss = doc.css;
    }
  }

  // ---------- Önizleme çerçevesi ----------
  let frame = $state<HTMLIFrameElement | null>(null);
  let frameReady = $state(false);
  let device = $state<'desktop' | 'tablet' | 'mobile'>('desktop');
  const frameSrc = $derived(`/studio/frame?layout=${form.layout}`);
  const toFrame = (msg: ToFrame) => frame?.contentWindow?.postMessage({ ns: STUDIO_MSG, msg }, location.origin);

  let resolved = $state(new Map<string, ResolvedBlock>());
  let resolving = $state(false);
  let previewError = $state<string | null>(null);
  // Metinler ve canlı veriler sunucuda çözülür (yazmayı bekleyerek)
  $effect(() => {
    if (form.format !== 'builder') return;
    const json = JSON.stringify({ version: 1, blocks: $state.snapshot(blocks), css: '' });
    const t = setTimeout(async () => {
      resolving = true;
      try {
        const res = await api.post<{ blocks: ResolvedBlock[] }>('/api/admin/pages/builder-preview', { body: json });
        resolved = new Map(res.blocks.map((b) => [b.id, b]));
        previewError = null;
      } catch (e) {
        previewError = errorMessage(e);
      } finally {
        resolving = false;
      }
    }, 400);
    return () => clearTimeout(t);
  });
  // Çerçeveye gönder
  $effect(() => {
    if (!frameReady) return;
    if (form.format === 'builder') {
      const merged = $state.snapshot(blocks).map((b) => ({ ...(resolved.get(b.id) ?? {}), ...b }) as ResolvedBlock);
      toFrame({ type: 'blocks', blocks: merged, selectedId, css: data.canCode ? pageCss : '', standalone: form.layout === 'blank' });
    } else if (form.format === 'html') {
      toFrame({ type: 'html', html: form.body });
    }
  });
  // Metin sayfası önizlemesi
  $effect(() => {
    if (!frameReady || form.format !== 'bbcode') return;
    const body = form.body;
    const title = form.showTitle ? form.title : null;
    const t = setTimeout(async () => {
      try {
        toFrame({ type: 'prose', html: await previewBBCode(body), title });
      } catch {
        /* yoksay */
      }
    }, 350);
    return () => clearTimeout(t);
  });
  $effect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame?.contentWindow || e.data?.ns !== STUDIO_MSG) return;
      const m = e.data.msg as FromFrame;
      if (m.type === 'ready') {
        frameReady = false;
        queueMicrotask(() => (frameReady = true));
      } else if (m.type === 'select') {
        selectedId = m.id;
        leftTab = 'blocks';
      } else if (m.type === 'action') {
        const i = blocks.findIndex((b) => b.id === m.id);
        if (i < 0) return;
        if (m.action === 'up') move(i, -1);
        else if (m.action === 'down') move(i, 1);
        else if (m.action === 'duplicate') duplicate(i);
        else if (m.action === 'remove') remove(i);
        else if (m.action === 'insert') openPalette(i + 1);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });

  // ---------- Blok işlemleri ----------
  let paletteOpen = $state(false);
  let insertAt = $state<number | null>(null);
  function openPalette(at: number | null = null) {
    insertAt = at;
    paletteOpen = true;
  }
  function select(id: string) {
    selectedId = id;
    toFrame({ type: 'scroll', id });
  }
  function add(type: BuilderBlockType) {
    const b = defaultBlock(type);
    const at = insertAt ?? (selIndex >= 0 ? selIndex + 1 : blocks.length);
    blocks.splice(at, 0, b);
    selectedId = b.id;
    paletteOpen = false;
    setTimeout(() => toFrame({ type: 'scroll', id: b.id }), 120);
  }
  function duplicate(i: number) {
    const copy = { ...$state.snapshot(blocks[i]!), id: newBlockId() } as BuilderBlock;
    blocks.splice(i + 1, 0, copy);
    selectedId = copy.id;
  }
  function remove(i: number) {
    const [gone] = blocks.splice(i, 1);
    if (gone?.id === selectedId) selectedId = null;
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
  }
  async function useTemplate(key: string) {
    const tpl = BUILDER_TEMPLATES.find((x) => x.key === key);
    if (!tpl) return;
    if (blocks.length && !(await confirmAction({ title: t('Şablon uygulansın mı?'), description: t('Sayfadaki mevcut bloklar şablonla değiştirilecek.'), confirmLabel: t('Uygula') }))) return;
    blocks = tpl.blocks();
    selectedId = null;
    templatesOpen = false;
  }
  let templatesOpen = $state(false);
  const onDnd = (e: CustomEvent<DndEvent<BuilderBlock>>) => (blocks = e.detail.items);
  const summary = (b: BuilderBlock) => {
    const text = 'title' in b ? b.title : b.type === 'server' ? b.name : b.type === 'image' ? b.caption : b.type === 'navbar' ? b.brand : '';
    return String(text ?? '').replace(/\s+/g, ' ').slice(0, 36) || t(BUILDER_BLOCKS[b.type].label);
  };

  // ---------- Kaydetme ----------
  const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  const slugify = (s: string) =>
    s
      .toLocaleLowerCase('tr-TR')
      .replace(/[çğıöşüâîû]/g, (c) => TR[c] ?? c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);
  let saved = false;
  async function save(publish?: boolean) {
    if (!form.title.trim()) {
      leftTab = 'page';
      return toast.error(t('Sayfa başlığı gerekli.'));
    }
    if (!form.slug.trim()) form.slug = slugify(form.title) || `sayfa-${Date.now().toString(36)}`;
    if (publish !== undefined) form.isPublished = publish;
    saving = true;
    errors = {};
    try {
      const body = { ...form, metaDescription: form.metaDescription?.trim() || null };
      const res = data.page ? await api.put<AdminCustomPage>(`/api/admin/pages/${data.page.id}`, body) : await api.post<AdminCustomPage>('/api/admin/pages', body);
      snapshot = JSON.stringify(form);
      toast.success(data.page ? t('Kaydedildi.') : t('Sayfa oluşturuldu.'));
      if (!data.page) {
        saved = true;
        await goto(`/studio/${res.id}`, { replaceState: true, invalidateAll: true });
      }
    } catch (e) {
      if (e instanceof ApiError) {
        errors = e.fields;
        if (Object.keys(e.fields).some((k) => k !== 'body')) leftTab = 'page';
        toast.error(Object.values(e.fields)[0] ?? e.message);
      } else toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }
  async function remove_() {
    if (!data.page || !(await confirmAction({ title: t('Sayfa silinsin mi?'), description: t('/pages/{slug} adresi artık açılmaz.', { slug: data.page.slug }), confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/admin/pages/${data.page.id}`);
      saved = true;
      toast.success(t('Sayfa silindi.'));
      await goto('/admin/pages');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  const isLanding = $derived(!!data.page && data.landingSlug === data.page.slug);
  let landingBusy = $state(false);
  async function toggleLanding(on: boolean) {
    if (!data.page) return;
    landingBusy = true;
    try {
      await api.put('/api/admin/pages/landing', { id: on ? data.page.id : null });
      toast.success(on ? t('Bu sayfa artık ana sayfa; forum /forum adresinde.') : t('Ana sayfa yeniden forum dizini.'));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      landingBusy = false;
    }
  }

  beforeNavigate((nav) => {
    if (dirty && !saved && !confirm(t('Kaydedilmemiş değişiklikler kaybolacak. Çıkılsın mı?'))) nav.cancel();
  });
  function onkeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!saving && !locked) void save();
    }
  }

  let leftTab = $state<'blocks' | 'page' | 'code'>(untrack(() => (form.format === 'builder' ? 'blocks' : 'page')));
  const tabBtn = (on: boolean) => cn('flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors', on ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground');
  const DEVICES = [
    { v: 'desktop', icon: MonitorIcon, w: '100%', l: 'Masaüstü' },
    { v: 'tablet', icon: TabletIcon, w: '820px', l: 'Tablet' },
    { v: 'mobile', icon: PhoneIcon, w: '390px', l: 'Telefon' },
  ] as const;
</script>

<svelte:window {onkeydown} />
<svelte:head><title>{form.title || t('Yeni sayfa')} · {t('Stüdyo')}</title></svelte:head>

{#if !data.elevated}
  <div class="grid min-h-dvh place-items-center bg-muted/30 p-4"><ElevationGate twoFactor={!!data.viewer.user?.twoFactorEnabled} /></div>
{:else}
  <div class="flex h-dvh flex-col overflow-hidden bg-muted/40" data-part="studio">
    <!-- Üst çubuk -->
    <header class="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-2 sm:px-3">
      <Button variant="ghost" size="icon" href="/admin/pages" title={t('Sayfalara dön')}><ArrowLeftIcon /></Button>
      <div class="flex min-w-0 items-center gap-2">
        <span class="hidden items-center gap-1.5 rounded-md bg-primary-soft px-2 py-1 text-xs font-bold text-highlight sm:inline-flex"><SparkleIcon class="size-3.5" weight="fill" />{t('Stüdyo')}</span>
        <input
          bind:value={form.title}
          oninput={() => !slugTouched && (form.slug = slugify(form.title))}
          placeholder={t('Sayfa başlığı')}
          maxlength={120}
          class="h-9 w-40 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm font-bold outline-none hover:border-border focus:border-ring sm:w-64"
          aria-label={t('Sayfa başlığı')}
          disabled={locked}
        />
        <span class={cn('hidden rounded-full px-2 py-0.5 text-[11px] font-bold md:inline', form.isPublished ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning')}>{form.isPublished ? t('Yayında') : t('Taslak')}</span>
        {#if isLanding}<span class="hidden items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-highlight md:inline-flex"><HouseIcon class="size-3" />{t('Ana sayfa')}</span>{/if}
      </div>

      <!-- Cihaz -->
      <div class="mx-auto hidden rounded-lg bg-muted p-0.5 md:flex" role="radiogroup" aria-label={t('Önizleme boyutu')}>
        {#each DEVICES as d (d.v)}
          <button type="button" class={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors', device === d.v ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')} onclick={() => (device = d.v)} role="radio" aria-checked={device === d.v} title={t(d.l)}>
            <d.icon class="size-4" /><span class="hidden lg:inline">{t(d.l)}</span>
          </button>
        {/each}
      </div>

      <div class="ml-auto flex items-center gap-1.5">
        {#if resolving}<LoaderIcon class="size-4 animate-spin text-muted-foreground" />{/if}
        <span class={cn('hidden text-xs text-muted-foreground lg:inline', !dirty && 'invisible')}>{t('Kaydedilmedi')} · Ctrl+S</span>
        {#if data.page}<Button variant="ghost" size="sm" href="/pages/{data.page.slug}" target="_blank"><ArrowSquareOutIcon />{t('Görüntüle')}</Button>{/if}
        <Button variant="outline" size="sm" onclick={() => save()} disabled={saving || locked || (!dirty && !!data.page)}>{#if saving}<LoaderIcon class="animate-spin" />{:else}<FloppyIcon />{/if}{t('Kaydet')}</Button>
        {#if !form.isPublished}<Button size="sm" onclick={() => save(true)} disabled={saving || locked}>{t('Yayınla')}</Button>{/if}
      </div>
    </header>

    <div class={cn('grid min-h-0 flex-1', form.format === 'builder' ? 'grid-cols-[17rem_minmax(0,1fr)_22rem]' : 'grid-cols-[19rem_minmax(0,1fr)_minmax(0,1fr)]')}>
      <!-- Sol panel -->
      <aside class="flex min-h-0 flex-col border-r bg-card">
        <div class="flex gap-1 border-b p-2">
          <div class="flex flex-1 rounded-lg bg-muted p-0.5">
            {#if form.format === 'builder'}<button type="button" class={tabBtn(leftTab === 'blocks')} onclick={() => (leftTab = 'blocks')}><SquaresIcon class="size-3.5" />{t('Bloklar')}</button>{/if}
            <button type="button" class={tabBtn(leftTab === 'page')} onclick={() => (leftTab = 'page')}><GearIcon class="size-3.5" />{t('Sayfa')}</button>
            {#if form.format === 'builder'}<button type="button" class={tabBtn(leftTab === 'code')} onclick={() => (leftTab = 'code')}><CodeIcon class="size-3.5" />{t('Kod')}</button>{/if}
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          {#if leftTab === 'blocks' && form.format === 'builder'}
            <div class="grid gap-2">
              <div class="grid grid-cols-2 gap-1.5">
                <Button size="sm" onclick={() => openPalette(null)}><PlusIcon />{t('Blok ekle')}</Button>
                <Button size="sm" variant="outline" onclick={() => (templatesOpen = true)}><LayoutIcon />{t('Şablonlar')}</Button>
              </div>
              {#if previewError}<p class="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{previewError}</p>{/if}
              <div
                class="grid min-h-12 gap-1"
                use:dndzone={{ items: blocks, flipDurationMs: 160, type: 'studio-blocks', dropTargetStyle: { outline: '2px dashed var(--primary)', outlineOffset: '2px', borderRadius: '8px' } }}
                onconsider={onDnd}
                onfinalize={onDnd}
              >
                {#each blocks as b (b.id)}
                  {@const Icon = BLOCK_ICONS[b.type]}
                  <div animate:flip={{ duration: 160 }}>
                    <div
                      role="button"
                      tabindex="0"
                      onclick={() => select(b.id)}
                      onkeydown={(e) => e.key === 'Enter' && select(b.id)}
                      class={cn('flex cursor-grab items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition-colors active:cursor-grabbing', selectedId === b.id ? 'border-primary bg-primary-soft' : 'bg-background hover:bg-accent')}
                    >
                      <DotsSixIcon class="size-4 shrink-0 text-muted-foreground" />
                      <Icon class={cn('size-4 shrink-0', selectedId === b.id ? 'text-primary' : 'text-muted-foreground')} weight="duotone" />
                      <span class="min-w-0 flex-1 truncate">{summary(b)}</span>
                      {#if b.visibility !== 'all'}<EyeSlashIcon class="size-3.5 shrink-0 text-muted-foreground" />{/if}
                    </div>
                  </div>
                {/each}
              </div>
              {#if !blocks.length}<p class="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">{t('Henüz blok yok. Bir şablonla başlayın ya da blok ekleyin.')}</p>{/if}
              <p class="text-[11px] leading-snug text-muted-foreground">{t('Sıralamak için sürükleyin. Önizlemede bir bloğa tıklayınca ayarları sağda açılır; üzerine gelince taşıma, çoğaltma ve silme düğmeleri çıkar.')}</p>
            </div>
          {:else if leftTab === 'code' && form.format === 'builder'}
            <div class="grid gap-3">
              {#if data.canCode}
                <Field label={t('Sayfa CSS')} hint={t('Yalnızca bu sayfada geçerli. JavaScript için "Özel HTML" bloğunu kullanın.')}>
                  <CodeEditor bind:value={pageCss} language="CSS" minHeight={380} maxLength={50000} placeholder={'.hero h1 { letter-spacing: -0.04em; }'} />
                </Field>
                <Button size="sm" variant="outline" onclick={() => ((insertAt = null), add('html'))}><CodeIcon />{t('Özel HTML / JS bloğu ekle')}</Button>
              {:else}
                <p class="rounded-md bg-muted px-3 py-2 text-xs">{t('Sayfaya kendi kodunuzu eklemek için "Özel kod" yetkisi gerekir.')}</p>
              {/if}
            </div>
          {:else}
            <div class="grid gap-4">
              <div class="grid gap-1.5">
                <span class="text-xs font-semibold text-muted-foreground">{t('İçerik türü')}</span>
                <div class="grid grid-cols-3 gap-1 rounded-lg bg-muted p-0.5">
                  <button type="button" class={tabBtn(form.format === 'builder')} onclick={() => setFormat('builder')} disabled={locked}><LayoutIcon class="size-3.5" />{t('Bloklar')}</button>
                  <button type="button" class={tabBtn(form.format === 'bbcode')} onclick={() => setFormat('bbcode')} disabled={locked}><TextIcon class="size-3.5" />{t('Metin')}</button>
                  <button type="button" class={tabBtn(form.format === 'html')} onclick={() => setFormat('html')} disabled={locked || !data.canCode} title={data.canCode ? '' : t('"Özel kod" yetkisi gerekir')}><CodeIcon class="size-3.5" />{t('Kod')}</button>
                </div>
              </div>
              <Field label={t('Adres')} error={errors.slug}>
                <div class="flex items-center overflow-hidden rounded-md border bg-background focus-within:border-ring">
                  <span class="border-r bg-muted px-2 py-2 font-mono text-xs text-muted-foreground">/pages/</span>
                  <input bind:value={form.slug} oninput={() => (slugTouched = true)} maxlength={60} class="min-w-0 flex-1 bg-transparent px-2 py-2 font-mono text-sm outline-none" disabled={locked} />
                </div>
              </Field>
              <div class="grid gap-1.5">
                <span class="text-xs font-semibold text-muted-foreground">{t('Düzen')}</span>
                {#each PAGE_LAYOUTS as l (l)}
                  <label class={cn('flex cursor-pointer items-start gap-2 rounded-lg border p-2 transition-colors', form.layout === l ? 'border-primary bg-primary-soft' : 'hover:bg-accent')}>
                    <input type="radio" bind:group={form.layout} value={l} class="mt-1 accent-[var(--primary)]" disabled={locked} />
                    <span class="grid"><span class="text-sm font-semibold">{t(PAGE_LAYOUT_INFO[l].label)}</span><span class="text-[11px] leading-snug text-muted-foreground">{t(PAGE_LAYOUT_INFO[l].description)}</span></span>
                  </label>
                {/each}
              </div>
              {#if form.format !== 'builder'}<label class="flex items-center justify-between text-sm">{t('Başlığı göster')} <Switch bind:checked={form.showTitle} /></label>{/if}
              <label class="flex items-center justify-between text-sm font-semibold">{t('Yayında')} <Switch bind:checked={form.isPublished} disabled={locked} /></label>
              {#if data.page}
                <label class={cn('grid gap-1 rounded-lg border p-2.5', isLanding && 'border-primary/50 bg-primary-soft')}>
                  <span class="flex items-center justify-between text-sm font-semibold"><span class="inline-flex items-center gap-1.5"><HouseIcon class="size-4" />{t('Ana sayfa yap')}</span><Switch checked={isLanding} disabled={landingBusy || !data.page.isPublished} onCheckedChange={toggleLanding} /></span>
                  <span class="text-[11px] leading-snug text-muted-foreground">{t('Açılırsa ziyaretçiler siteye girince bu sayfayı görür; forum /forum adresine taşınır.')}</span>
                </label>
              {/if}
              <VisibilityField bind:visibility={form.visibility} bind:groupIds={form.groupIds} groups={data.groups} error={errors.groupIds} />
              <Field label={t('Arama motoru açıklaması')} hint={t('Google ve paylaşım önizlemelerinde görünür.')}>
                <Textarea bind:value={form.metaDescription} rows={3} maxlength={300} disabled={locked} />
              </Field>
              {#if data.page && !locked}<Button variant="ghost" size="sm" class="text-destructive" onclick={remove_}><TrashIcon />{t('Sayfayı sil')}</Button>{/if}
            </div>
          {/if}
        </div>
      </aside>

      {#if form.format !== 'builder'}
        <!-- Kod / metin düzenleyici -->
        <section class="min-h-0 overflow-y-auto border-r bg-card p-3">
          {#if form.format === 'html'}
            <CodeEditor bind:value={form.body} minHeight={640} maxLength={500000} placeholder={'<section class="ucp">\n  <h2>Hoş geldin {{viewer.displayName}}</h2>\n</section>'} />
            <p class="mt-2 text-xs text-muted-foreground">{'{{viewer.username}}'} {t('gibi değişkenler ve window.forum kullanılabilir. Kod önizlemede gerçekten çalışır.')}</p>
          {:else}
            <Editor bind:value={form.body} maxLength={200000} minHeight={600} mentions={false} disabled={locked} uploadUrl="/api/admin/pages/images" />
          {/if}
        </section>
      {/if}

      <!-- Önizleme -->
      <section class="relative min-h-0 overflow-auto p-3 sm:p-5">
        <div class={cn('mx-auto h-full overflow-hidden bg-background shadow-xl transition-[width] duration-300', device === 'desktop' ? 'rounded-lg border' : 'rounded-[1.75rem] border-8 border-zinc-800')} style="width:{DEVICES.find((d) => d.v === device)?.w}">
          {#key frameSrc}
            <iframe bind:this={frame} src={frameSrc} title={t('Sayfa önizlemesi')} class="size-full"></iframe>
          {/key}
        </div>
      </section>

      {#if form.format === 'builder'}
        <!-- Seçili blok -->
        <aside class="min-h-0 overflow-y-auto border-l bg-card p-3">
          {#if selIndex >= 0 && blocks[selIndex]}
            {#key selectedId}
              {@const Icon = BLOCK_ICONS[blocks[selIndex].type]}
              <div class="grid gap-3" in:fly={{ x: 12, duration: 180 }}>
                <div class="flex items-center gap-2">
                  <span class="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon class="size-4" weight="duotone" /></span>
                  <p class="flex-1 font-bold">{t(BUILDER_BLOCKS[blocks[selIndex].type].label)}</p>
                  <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => remove(selIndex)} title={t('Bloğu sil')}><TrashIcon /></Button>
                </div>
                <BlockInspector bind:block={blocks[selIndex]} canCode={data.canCode} groups={data.groups} />
              </div>
            {/key}
          {:else}
            <div class="grid h-full place-items-center">
              <div class="grid justify-items-center gap-2 text-center text-sm text-muted-foreground">
                <CursorClickIcon class="size-7" />{t('Düzenlemek için önizlemede')}<br />{t('bir bloğa tıklayın.')}
              </div>
            </div>
          {/if}
        </aside>
      {/if}
    </div>
  </div>

  <!-- Blok kataloğu -->
  <Dialog.Root bind:open={paletteOpen}>
    <Dialog.Content class="sm:max-w-3xl">
      <Dialog.Header>
        <Dialog.Title>{t('Blok ekle')}</Dialog.Title>
        <Dialog.Description>{t('Eklemek istediğin bloğu seç; ayarlarını sağ panelden değiştirebilirsin.')}</Dialog.Description>
      </Dialog.Header>
      <div class="grid max-h-[65vh] gap-5 overflow-y-auto pr-1">
        {#each BLOCK_GROUPS as g (g.key)}
          <div class="grid gap-2">
            <p class="text-xs font-bold tracking-wider text-muted-foreground uppercase">{t(g.label)}</p>
            <div class="grid gap-2 sm:grid-cols-2">
              {#each Object.entries(BUILDER_BLOCKS).filter(([, d]) => d.group === g.key) as [type, d] (type)}
                {@const Icon = BLOCK_ICONS[type as BuilderBlockType]}
                {@const disabled = type === 'html' && !data.canCode}
                <button type="button" {disabled} onclick={() => add(type as BuilderBlockType)} class="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent disabled:opacity-50">
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon class="size-5" weight="duotone" /></span>
                  <span class="grid gap-0.5"><span class="text-sm font-bold">{t(d.label)}</span><span class="text-xs text-muted-foreground">{t(d.description)}</span></span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </Dialog.Content>
  </Dialog.Root>

  <!-- Şablonlar -->
  <Dialog.Root bind:open={templatesOpen}>
    <Dialog.Content class="sm:max-w-2xl">
      <Dialog.Header>
        <Dialog.Title>{t('Şablonlar')}</Dialog.Title>
        <Dialog.Description>{t('Hazır bir sayfayla başla; her şey sonradan düzenlenebilir.')}</Dialog.Description>
      </Dialog.Header>
      <div class="grid gap-2">
        {#each BUILDER_TEMPLATES as tpl (tpl.key)}
          <button type="button" onclick={() => useTemplate(tpl.key)} class="grid gap-0.5 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent">
            <span class="font-bold">{t(tpl.label)}</span><span class="text-xs text-muted-foreground">{t(tpl.description)}</span>
          </button>
        {/each}
      </div>
    </Dialog.Content>
  </Dialog.Root>
{/if}
