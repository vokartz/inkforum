<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Palette';
  import { invalidate, invalidateAll } from '$app/navigation';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { toast } from 'svelte-sonner';
  import { FONT_OPTIONS, GLOBAL_PERMISSIONS, type IconNode } from '@forum/shared';
  import ChevronUpIcon from 'phosphor-svelte/lib/CaretUp';
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import Trash2Icon from 'phosphor-svelte/lib/Trash';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import GripVerticalIcon from 'phosphor-svelte/lib/DotsSixVertical';
  import SaveIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import MoonIcon from 'phosphor-svelte/lib/Moon';
  import SunIcon from 'phosphor-svelte/lib/Sun';
  import MonitorIcon from 'phosphor-svelte/lib/Monitor';
  import EyeOffIcon from 'phosphor-svelte/lib/EyeSlash';
  import ExternalLinkIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import ChevronDownIcon from 'phosphor-svelte/lib/CaretDown';
  import LayoutTemplateIcon from 'phosphor-svelte/lib/Layout';
  import * as Card from '$lib/components/ui/card';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import { Badge } from '$lib/components/ui/badge';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import IconPicker from '$lib/components/IconPicker.svelte';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import BrandIcon from '$lib/components/BrandIcon.svelte';
  import AppearanceReset from './AppearanceReset.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';

  let { data } = $props();
  const a = $derived(data.appearance);
  const settingValue = (key: string) => data.settings?.definitions.find((d) => d.key === key)?.value;

  type AssetKey = 'logo' | 'logoLight' | 'favicon' | 'banner' | 'background' | 'footer' | 'auth' | 'defaultAvatar';
  const ASSET_HELP: Record<AssetKey, string> = {
    logo: 'Üst çubukta ve bannerda görünür. Şeffaf PNG veya WEBP önerilir.',
    logoLight: 'İsteğe bağlı: açık modda kullanılacak (koyu renkli) logo.',
    favicon: 'Tarayıcı sekmesinde görünür. Kare, en az 64×64 piksel.',
    banner: 'Banner açıkken arka planda görünür (yüklenmezse vurgu renginden desen). En az 1920×300 piksel önerilir.',
    background: 'Tüm sayfaların arkasında görünür; yazılar okunaklı kalsın diye üzerine tema renginde örtü uygulanır.',
    defaultAvatar: 'Profil fotoğrafı yüklemeyen üyelerde görünür. Kare, en az 256×256 piksel.',
    footer: 'Alt bilginin arkasında görünür; üst kenarı sayfaya karışır. En az 1920×500 piksel önerilir.',
    auth: 'Giriş, kayıt ve şifre sıfırlama sayfalarının sol yarısında görünür. Dikey ya da kare, en az 1200×1400 piksel.',
  };

  // ---------- Marka ----------
  let accent = $state('#7b61ff');
  let mode = $state<'dark' | 'light' | 'system'>('dark');
  let showName = $state(true);
  let bannerHeight = $state(160);
  let bannerEnabled = $state(true);
  let bannerTagline = $state('');
  let bannerColor = $state('#16171b');
  let colorSpread = $state<'none' | 'soft' | 'medium' | 'strong'>('none');
  let backgroundDim = $state(80);
  let themeStyle = $state<'modern' | 'classic' | 'community'>('modern');
  let radius = $state('auto');
  let postLayout = $state<'side' | 'top'>('side');
  let footerText = $state('');
  let footerLinks = $state<Array<{ label: string; url: string; newTab: boolean }>>([]);
  let fontFamily = $state('roboto');
  let cookieBanner = $state(true);
  let poweredBy = $state(true);
  let cookieText = $state('');
  let social = $state<Array<{ platform: string; url: string }>>([]);

  function syncState1() {
    if (!data.settings || !a) return;
    accent = String(settingValue('appearance.accentColor') ?? '#7b61ff');
    mode = (settingValue('appearance.defaultMode') ?? 'dark') as typeof mode;
    showName = settingValue('appearance.showForumName') === true;
    bannerHeight = Number(settingValue('appearance.bannerHeight') ?? 160);
    bannerEnabled = settingValue('appearance.bannerEnabled') !== false;
    bannerTagline = String(settingValue('appearance.bannerTagline') ?? '');
    bannerColor = String(settingValue('appearance.bannerColor') ?? '#16171b');
    colorSpread = (settingValue('appearance.colorSpread') ?? 'none') as typeof colorSpread;
    backgroundDim = Number(settingValue('appearance.backgroundDim') ?? 80);
    footerText = String(settingValue('appearance.footerText') ?? '');
    footerLinks = a.footerLinks.map((l) => ({ ...l, newTab: !!l.newTab }));
    fontFamily = String(settingValue('appearance.fontFamily') ?? 'roboto');
    themeStyle = (settingValue('appearance.themeStyle') ?? 'modern') as typeof themeStyle;
    radius = String(settingValue('appearance.radius') ?? 'auto');
    postLayout = (settingValue('appearance.postLayout') ?? 'side') as typeof postLayout;
    cookieBanner = settingValue('cookies.bannerEnabled') !== false;
    poweredBy = settingValue('appearance.poweredBy') !== false;
    cookieText = String(settingValue('cookies.bannerText') ?? '');
    social = a.socialLinks.map((l) => ({ ...l }));
    navTree = buildTree();
  }

  const THEMES = [
    { key: 'modern', label: 'Modern', description: 'Sade, düz ve koyu; ince üst çubuk. Günümüz web uygulamaları gibi.', bg: '#09090b' },
    { key: 'classic', label: 'Klasik (SMF)', description: 'SMF 2 "Curve" düzeni: çerçeveli üst bölüm, haberler kutusu, degrade düğmeler, dönüşümlü satırlar, altta bilgi merkezi.', bg: '#e5eaef' },
    { key: 'community', label: 'Topluluk (IPS tarzı)', description: 'Bannerlı üst alan, altında menü çubuğu; koyu gri geniş kartlar.', bg: '#262626' },
  ] as const;
  const RADII = [
    { value: 'auto', label: 'Temaya göre', css: '0.5rem' },
    { value: 'none', label: 'Köşeli', css: '0' },
    { value: 'sm', label: 'Az', css: '0.25rem' },
    { value: 'md', label: 'Orta', css: '0.5rem' },
    { value: 'lg', label: 'Yuvarlak', css: '0.875rem' },
    { value: 'xl', label: 'Çok', css: '1.25rem' },
  ];
  const SPREADS = [
    { v: 'none', l: 'Yalnızca butonlar', pct: 0 },
    { v: 'soft', l: 'Hafif', pct: 3 },
    { v: 'medium', l: 'Belirgin', pct: 6 },
    { v: 'strong', l: 'Güçlü', pct: 11 },
  ] as const;
  const PALETTE = ['#9c9c9c', '#7b61ff', '#f5a524', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#e11d48'];

  let savingBrand = $state(false);
  async function saveBrand() {
    savingBrand = true;
    try {
      await api.put('/api/admin/settings', {
        'appearance.accentColor': accent,
        'appearance.defaultMode': mode,
        'appearance.showForumName': showName,
        'appearance.bannerHeight': bannerHeight,
        'appearance.bannerEnabled': bannerEnabled,
        'appearance.bannerTagline': bannerTagline,
        'appearance.bannerColor': bannerColor,
        'appearance.colorSpread': colorSpread,
        'appearance.backgroundDim': backgroundDim,
        'appearance.fontFamily': fontFamily,
        'appearance.themeStyle': themeStyle,
        'appearance.radius': radius,
        'appearance.postLayout': postLayout,
      });
      toast.success(t('Görünüm kaydedildi.'));
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : errorMessage(e));
    } finally {
      savingBrand = false;
    }
  }

  let uploading = $state<AssetKey | null>(null);
  async function upload(kind: AssetKey, ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    uploading = kind;
    try {
      await api.upload(`/api/admin/appearance/assets/${kind}`, file, file.name);
      toast.success(t('Görsel yüklendi.'));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      uploading = null;
    }
  }
  async function removeAsset(kind: AssetKey) {
    try {
      await api.delete(`/api/admin/appearance/assets/${kind}`);
      toast.success(t('Görsel kaldırıldı.'));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  // ---------- Menü ----------
  interface NavNode {
    uid: string;
    id?: number;
    kind: 'builtin' | 'link' | 'dropdown';
    builtinKey: string | null;
    label: string;
    url: string | null;
    icon: string | null;
    iconNodes: IconNode | null;
    newTab: boolean;
    visibility: 'all' | 'members' | 'guests';
    permission: string | null;
    isEnabled: boolean;
    style: 'link' | 'button';
    children: NavNode[];
  }
  let navTree = $state<NavNode[]>([]);
  let navDirty = $state(false);
  let uidSeq = 0;
  const uid = () => `n${++uidSeq}`;

  function buildTree(): NavNode[] {
    if (!a) return [];
    const toNode = (i: (typeof a.nav)[number]): NavNode => ({
      uid: uid(),
      id: i.id,
      kind: i.kind,
      builtinKey: i.builtinKey,
      label: i.label,
      url: i.url,
      icon: i.icon,
      iconNodes: i.iconNodes,
      newTab: i.newTab,
      visibility: i.visibility,
      permission: i.permission,
      isEnabled: i.isEnabled,
      style: i.style,
      children: a.nav.filter((c) => c.parentId === i.id).map(toNode),
    });
    navDirty = false;
    return a.nav.filter((i) => !i.parentId).map(toNode);
  }

  syncState1();
  $effect.pre(syncState1);

  function onTop(e: CustomEvent<DndEvent<NavNode>>, final: boolean) {
    navTree = e.detail.items;
    if (final) navDirty = true;
  }
  function onChildren(parent: NavNode, e: CustomEvent<DndEvent<NavNode>>, final: boolean) {
    parent.children = e.detail.items;
    if (final) navDirty = true;
  }

  const builtinUsed = $derived(new Set(navTree.flatMap((n) => [n, ...n.children]).filter((n) => n.kind === 'builtin').map((n) => n.builtinKey)));
  const hrefOf = (n: NavNode) => (n.kind === 'builtin' ? (a?.builtins.find((b) => b.key === n.builtinKey)?.url ?? '') : (n.url ?? ''));

  // Düzenleme penceresi
  let editOpen = $state(false);
  let edit = $state<NavNode | null>(null);
  let editIsNew = $state(false);

  function addBuiltin(key: string) {
    const b = a!.builtins.find((x) => x.key === key)!;
    navTree = [...navTree, { uid: uid(), kind: 'builtin', builtinKey: key, label: b.label, url: null, icon: b.icon, iconNodes: null, newTab: false, visibility: b.visibility as NavNode['visibility'], permission: null, isEnabled: true, style: 'link', children: [] }];
    navDirty = true;
  }
  function openNew(kind: 'link' | 'dropdown') {
    edit = { uid: uid(), kind, builtinKey: null, label: '', url: kind === 'link' ? 'https://' : null, icon: kind === 'dropdown' ? 'layout-grid' : 'link', iconNodes: null, newTab: false, visibility: 'all', permission: null, isEnabled: true, style: 'link', children: [] };
    editIsNew = true;
    editOpen = true;
  }
  function openEdit(n: NavNode) {
    edit = { ...n, children: n.children };
    editIsNew = false;
    editOpen = true;
  }
  function applyEdit(ev: SubmitEvent) {
    ev.preventDefault();
    if (!edit || !edit.label.trim()) return;
    const node = $state.snapshot(edit) as NavNode;
    node.children = edit.children;
    if (editIsNew) navTree = [...navTree, node];
    else {
      const replace = (list: NavNode[]): NavNode[] => list.map((x) => (x.uid === node.uid ? node : { ...x, children: replace(x.children) }));
      navTree = replace(navTree);
    }
    navDirty = true;
    editOpen = false;
  }
  function removeNode(n: NavNode) {
    const drop = (list: NavNode[]): NavNode[] => list.filter((x) => x.uid !== n.uid).map((x) => ({ ...x, children: drop(x.children) }));
    navTree = drop(navTree);
    navDirty = true;
  }

  let savingNav = $state(false);
  async function saveNav() {
    const invalid = navTree.find((n) => n.kind !== 'dropdown' && n.children.length);
    if (invalid) return toast.error(t('"{label}" bir açılır menü değil; içine öğe bırakılamaz.', { label: invalid.label }));
    const nested = navTree.flatMap((n) => n.children).find((c) => c.kind === 'dropdown');
    if (nested) return toast.error(t('Açılır menüler iç içe olamaz.'));
    const strip = (n: NavNode) => ({
      id: n.id,
      kind: n.kind,
      builtinKey: n.builtinKey,
      label: n.label,
      url: n.url,
      icon: n.icon,
      newTab: n.newTab,
      visibility: n.visibility,
      permission: n.permission,
      isEnabled: n.isEnabled,
      style: n.style,
    });
    savingNav = true;
    try {
      await api.put('/api/admin/appearance/nav', { items: navTree.map((n) => ({ ...strip(n), children: n.children.map(strip) })) });
      toast.success(t('Menü kaydedildi.'));
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : errorMessage(e));
    } finally {
      savingNav = false;
    }
  }

  // ---------- Alt bilgi ----------
  let savingFooter = $state(false);
  async function saveFooter() {
    savingFooter = true;
    try {
      await api.put('/api/admin/settings', {
        'appearance.footerText': footerText,
        'appearance.poweredBy': poweredBy,
        'cookies.bannerEnabled': cookieBanner,
        'cookies.bannerText': cookieText,
      });
      await api.put('/api/admin/appearance/social', { links: social.filter((l) => l.url.trim()) });
      await api.put('/api/admin/appearance/footer', { links: footerLinks.filter((l) => l.label.trim() && l.url.trim()) });
      toast.success(t('Alt bilgi kaydedildi.'));
      await invalidate('app:admin-appearance');
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : errorMessage(e));
    } finally {
      savingFooter = false;
    }
  }

  const permOptions = $derived(GLOBAL_PERMISSIONS.map((p) => ({ value: p.key, label: t(p.label), description: p.key })));
  const visOptions = $derived([
    { value: 'all', label: t('Herkes') },
    { value: 'members', label: t('Yalnızca üyeler') },
    { value: 'guests', label: t('Yalnızca misafirler') },
  ]);
  const segBtn = 'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors';
</script>

<PageHeader icon={PageHeaderIcon} title={t('Görünüm')} description={t('Logo, renkler, üst menü ve alt bilgi. Değişiklikler kaydedilince tüm ziyaretçilere uygulanır.')}>
  {#snippet actions()}<AppearanceReset />{/snippet}
</PageHeader>

{#snippet row(n: NavNode, depth: number)}
  <div class={cn('group flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-xs', !n.isEnabled && 'opacity-50')}>
    <GripVerticalIcon class="size-4 shrink-0 cursor-grab text-muted-foreground" />
    <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      {#if n.iconNodes}<NodeIcon nodes={n.iconNodes} size={16} />{:else if n.icon}<span class="text-[10px]">{n.icon.slice(0, 3)}</span>{/if}
    </span>
    <div class="min-w-0 flex-1">
      <p class="flex items-center gap-2 text-sm font-medium">
        {n.label}
        {#if n.kind === 'builtin'}<Badge variant="secondary" class="text-[10px]">{t('Sistem')}</Badge>{/if}
        {#if n.kind === 'dropdown'}<Badge variant="outline" class="text-[10px]">{t('Açılır menü')}</Badge>{/if}
        {#if n.visibility !== 'all'}<Badge variant="outline" class="text-[10px]">{n.visibility === 'members' ? t('Üyeler') : t('Misafirler')}</Badge>{/if}
        {#if !n.isEnabled}<EyeOffIcon class="size-3.5 text-muted-foreground" />{/if}
      </p>
      {#if n.kind !== 'dropdown'}<p class="truncate text-xs text-muted-foreground">{hrefOf(n)}</p>{/if}
    </div>
    <Button variant="ghost" size="icon-sm" onclick={() => openEdit(n)} title={t('Düzenle')}><PencilIcon /></Button>
    <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => removeNode(n)} title={t('Kaldır')}><Trash2Icon /></Button>
  </div>
  {#if n.kind === 'dropdown' && depth === 0}
    <div
      class="mt-1.5 ml-8 grid min-h-10 gap-1.5 rounded-xl border-2 border-dashed p-1.5"
      use:dndzone={{ items: n.children, flipDurationMs: 150, type: 'nav', dropTargetStyle: { outline: '2px dashed var(--primary)' } }}
      onconsider={(e) => onChildren(n, e, false)}
      onfinalize={(e) => onChildren(n, e, true)}
    >
      {#each n.children as c (c.uid)}
        <div animate:flip={{ duration: 150 }}>{@render row(c, 1)}</div>
      {/each}
    </div>
  {/if}
{/snippet}

{#if a}
  <Tabs.Root value="brand" class="gap-6">
    <Tabs.List>
      <Tabs.Trigger value="brand">{t('Tema ve marka')}</Tabs.Trigger>
      <Tabs.Trigger value="nav">{t('Üst menü')}</Tabs.Trigger>
      <Tabs.Trigger value="footer">{t('Alt bilgi ve çerezler')}</Tabs.Trigger>
    </Tabs.List>

    <!-- Marka -->
    <Tabs.Content value="brand" class="grid gap-6">
      <!-- Tema seçimi -->
      <section class="grid gap-4 rounded-xl border bg-card p-5">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="font-bold">{t('Tema')}</h2>
            <p class="text-sm text-muted-foreground">{t('Forumun genel görünümü. Renk, yazı tipi ve görseller her temada geçerlidir.')}</p>
          </div>
          <Button onclick={saveBrand} disabled={savingBrand}>{#if savingBrand}<LoaderIcon class="animate-spin" />{:else}<SaveIcon />{/if}{t('Temayı uygula')}</Button>
        </div>
        <div class="grid gap-4 md:grid-cols-3">
          {#each THEMES as th (th.key)}
            <button
              type="button"
              onclick={() => (themeStyle = th.key)}
              class={cn('group grid gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50', themeStyle === th.key && 'border-primary ring-2 ring-primary/30')}
              aria-pressed={themeStyle === th.key}
            >
              <!-- Mini önizleme -->
              <div class="h-32 overflow-hidden rounded-md border" style="background:{th.bg}">
                {#if th.key === 'classic'}
                  <div class="m-2 rounded-sm border bg-white/90 p-1.5"><div class="h-2 w-16 rounded-sm bg-slate-400"></div></div>
                  <div class="mx-2 flex gap-1"><span class="h-3 w-8 rounded-t-sm" style="background:{accent}"></span><span class="h-3 w-8 rounded-t-sm bg-white/80"></span><span class="h-3 w-8 rounded-t-sm bg-white/80"></span></div>
                  <div class="mx-2 mt-1.5 rounded-sm" style="background:linear-gradient({accent},{accent}cc)"><div class="h-3"></div></div>
                  <div class="mx-2 space-y-px"><div class="h-4 bg-white"></div><div class="h-4 bg-slate-100"></div><div class="h-4 bg-white"></div></div>
                {:else if th.key === 'community'}
                  <div class="flex h-10 items-center justify-between bg-neutral-900 px-2"><span class="h-2.5 w-12 rounded-full bg-white/80"></span><span class="size-4 rounded-full bg-white/40"></span></div>
                  <div class="flex h-5 items-center gap-2 bg-neutral-800 px-2"><span class="h-1 w-6 rounded-full" style="background:{accent}"></span><span class="h-1 w-6 rounded-full bg-white/40"></span></div>
                  <div class="grid grid-cols-[1fr_28%] gap-1.5 p-2">
                    <div class="space-y-1 rounded-md bg-neutral-900 p-1.5"><div class="h-2 w-10 rounded bg-white/70"></div><div class="h-3 rounded bg-white/10"></div><div class="h-3 rounded bg-white/10"></div></div>
                    <div class="rounded-md bg-neutral-900"></div>
                  </div>
                {:else}
                  <div class="flex h-7 items-center gap-1.5 border-b border-white/10 px-2"><span class="h-2 w-10 rounded-full bg-white/80"></span><span class="h-3 w-8 rounded-full" style="background:{accent}55"></span><span class="ml-auto h-3 w-8 rounded" style="background:{accent}"></span></div>
                  <div class="grid grid-cols-[1fr_28%] gap-1.5 p-2">
                    <div class="space-y-1 rounded-md border border-white/10 p-1.5"><div class="h-2 w-10 rounded bg-white/70"></div><div class="h-3 rounded bg-white/5"></div><div class="h-3 rounded bg-white/5"></div></div>
                    <div class="rounded-md border border-white/10"></div>
                  </div>
                {/if}
              </div>
              <div>
                <p class="font-bold">{t(th.label)}</p>
                <p class="text-xs text-muted-foreground">{t(th.description)}</p>
              </div>
            </button>
          {/each}
        </div>
        <div class="grid gap-5 border-t pt-4 md:grid-cols-2">
          <Field label={t('Köşe yuvarlaklığı')} hint={t('Buton, kart ve kutuların köşeleri.')}>
            <div class="flex flex-wrap gap-1.5">
              {#each RADII as r (r.value)}
                <button
                  type="button"
                  onclick={() => (radius = r.value)}
                  class={cn('flex items-center gap-2 border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent', radius === r.value && 'border-primary bg-primary-soft')}
                  style="border-radius:{r.css}"
                >
                  {t(r.label)}
                </button>
              {/each}
            </div>
          </Field>
          <Field label={t('Konularda mesaj düzeni')}>
            <div class="grid grid-cols-2 gap-2">
              {#each [{ v: 'side', l: t('Yazar solda'), d: t('Klasik sütun') }, { v: 'top', l: t('Yazar üstte'), d: t('Yatay şerit') }] as o (o.v)}
                <button type="button" onclick={() => (postLayout = o.v as typeof postLayout)} class={cn('grid gap-2 rounded-md border p-2.5 text-left transition-colors hover:bg-accent', postLayout === o.v && 'border-primary bg-primary-soft')}>
                  <div class={cn('flex h-10 gap-1 rounded border bg-muted/40 p-1', o.v === 'top' && 'flex-col')}>
                    <span class={cn('rounded-sm bg-muted-foreground/40', o.v === 'side' ? 'w-5' : 'h-2.5')}></span>
                    <span class="flex-1 rounded-sm bg-muted-foreground/15"></span>
                  </div>
                  <span class="text-sm font-semibold">{o.l}<span class="block text-xs font-normal text-muted-foreground">{o.d}</span></span>
                </button>
              {/each}
            </div>
          </Field>
        </div>
      </section>

      <div class="grid gap-6 lg:grid-cols-2">
        <Card.Root>
          <Card.Header><Card.Title class="text-base">{t('Renkler ve üst alan')}</Card.Title></Card.Header>
          <Card.Content class="grid gap-5">
            <Field label={t('Vurgu rengi')}>
              <div class="flex flex-wrap items-center gap-2">
                {#each PALETTE as c (c)}
                  <button type="button" class={cn('size-7 rounded-full transition-transform hover:scale-110', accent === c && 'ring-2 ring-ring ring-offset-2 ring-offset-card')} style="background:{c}" aria-label={c} onclick={() => (accent = c)}></button>
                {/each}
                <input type="color" bind:value={accent} class="size-8 cursor-pointer rounded-md border bg-transparent" aria-label={t('Özel renk')} />
                <Input bind:value={accent} class="w-28 font-mono" maxlength={7} />
              </div>
            </Field>
            <Field label={t('Renk yayılımı')} hint={t('Vurgu renginin arka plan, kart, kenarlık ve üst alana ne kadar yansıyacağı.')}>
              <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {#each SPREADS as o (o.v)}
                  <button
                    type="button"
                    onclick={() => (colorSpread = o.v)}
                    class={cn('grid gap-1.5 rounded-md border p-2 text-left text-xs font-semibold transition-colors hover:bg-accent', colorSpread === o.v && 'border-primary bg-primary-soft')}
                  >
                    <span class="h-6 rounded-sm border" style="background:color-mix(in oklch, {accent} {o.pct * 2.2}%, var(--muted))"></span>{t(o.l)}
                  </button>
                {/each}
              </div>
            </Field>
            <Field label={t('Varsayılan renk modu')} hint={t('Tercih yapmamış ziyaretçilere uygulanır.')}>
              <div class="flex gap-1 rounded-lg bg-muted p-1">
                {#each [{ v: 'dark', l: t('Koyu'), i: MoonIcon }, { v: 'light', l: t('Açık'), i: SunIcon }, { v: 'system', l: t('Cihaza göre'), i: MonitorIcon }] as o (o.v)}
                  <button type="button" class={cn(segBtn, mode === o.v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')} onclick={() => (mode = o.v as typeof mode)}>
                    <o.i class="size-4" />{o.l}
                  </button>
                {/each}
              </div>
            </Field>
            <Field label={t('Yazı tipi')} hint={t('Tüm forumda kullanılır; yalnızca seçilen yazı tipi indirilir.')}>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {#each FONT_OPTIONS as f (f.key)}
                  <button
                    type="button"
                    class={cn('rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-accent', fontFamily === f.key && 'border-primary bg-primary-soft')}
                    style="font-family:{f.family}"
                    onclick={() => (fontFamily = f.key)}
                  >
                    <span class="block text-base font-bold">{f.label}</span>
                    <span class="block text-xs text-muted-foreground">{t('Çağrı, şöyle öğüt İ')}</span>
                  </button>
                {/each}
              </div>
            </Field>
            <div class="grid gap-3 rounded-lg border p-3">
              <label class="flex items-center gap-3 text-sm font-medium"><Switch bind:checked={bannerEnabled} />{t('Banner göster')}</label>
              <p class="-mt-1 text-xs text-muted-foreground">{t('Tüm temalarda üst alanda logolu banner. Görsel yüklenmediyse aşağıdaki düz renkle gösterilir.')}</p>
              {#if bannerEnabled}
                <Field label={t('Banner rengi')} hint={t('Banner görseli yoksa kullanılır. Yazı rengi okunaklı olacak şekilde otomatik seçilir.')}>
                  <div class="flex flex-wrap items-center gap-2">
                    {#each ['#16171b', '#0b0c0f', '#1f2937', '#27272a', '#f4f4f5', accent] as c (c)}
                      <button type="button" class={cn('size-8 rounded-lg border ring-offset-2 ring-offset-background transition-transform hover:scale-110', bannerColor === c && 'ring-2 ring-primary')} style="background:{c}" onclick={() => (bannerColor = c)} aria-label={t('Banner rengi {c}', { c })}></button>
                    {/each}
                    <input type="color" bind:value={bannerColor} class="h-8 w-12 cursor-pointer rounded border bg-transparent" aria-label={t('Özel banner rengi')} />
                    <span class="font-mono text-xs text-muted-foreground">{bannerColor}</span>
                  </div>
                </Field>
                <Field label={t('Banner yüksekliği: {n}px', { n: bannerHeight })}>
                  <input type="range" min={80} max={400} step={4} bind:value={bannerHeight} class="w-full accent-[var(--primary)]" />
                </Field>
                <Field label={t('Banner alt yazısı')} hint={t('Logonun altında kısa slogan; boşsa gösterilmez.')}>
                  <Input bind:value={bannerTagline} maxlength={160} placeholder={t("Ör. Türkiye'nin en büyük rol yapma topluluğu")} />
                </Field>
              {/if}
            </div>
            <Field label={t('Arka plan karartma: %{n}', { n: backgroundDim })} hint={t('Sayfa arka planı yüklendiyse görselin üzerine uygulanan örtü.')}>
              <input type="range" min={0} max={95} step={5} bind:value={backgroundDim} class="w-full accent-[var(--primary)]" />
            </Field>
            <label class="flex items-center gap-3 text-sm"><Switch bind:checked={showName} />{t('Logonun yanında forum adını göster')}</label>
            <div><Button onclick={saveBrand} disabled={savingBrand}>{#if savingBrand}<LoaderIcon class="animate-spin" />{:else}<SaveIcon />{/if}{t('Kaydet')}</Button></div>
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Title class="text-base">{t('Görseller')}</Card.Title>
            <Card.Description>{t('Yüklenen görseller hemen yayına alınır.')}</Card.Description>
          </Card.Header>
          <Card.Content class="grid gap-3">
            {#each Object.entries(a.assets) as [key, asset] (key)}
              {@const k = key as AssetKey}
              <div class="flex items-center gap-3 rounded-xl border p-3">
                <div class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:12px_12px]">
                  {#if asset.url}<img src={asset.url} alt={t(asset.label)} class="max-h-full max-w-full object-contain" />{:else}<LayoutTemplateIcon class="size-6 text-muted-foreground" />{/if}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium">{t(asset.label)}</p>
                  <p class="text-xs text-muted-foreground">{t(ASSET_HELP[k])} {t('En fazla {size}.', { size: asset.maxKb >= 1024 ? `${asset.maxKb / 1024} MB` : `${asset.maxKb} KB` })}</p>
                </div>
                <label class={cn('inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent', uploading === k && 'pointer-events-none opacity-60')}>
                  {#if uploading === k}<LoaderIcon class="size-4 animate-spin" />{:else}<UploadIcon class="size-4" />{/if}{t('Yükle')}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" onchange={(e) => upload(k, e)} />
                </label>
                {#if asset.url}<Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => removeAsset(k)} title={t('Kaldır')}><Trash2Icon /></Button>{/if}
              </div>
            {/each}
          </Card.Content>
        </Card.Root>
      </div>
    </Tabs.Content>

    <!-- Menü -->
    <Tabs.Content value="nav" class="grid gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <p class="mr-auto text-sm text-muted-foreground">{t('Öğeleri sürükleyerek sıralayın; bir açılır menünün altına bırakarak alt öğe yapın.')}</p>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}<Button {...props} variant="outline"><PlusIcon />{t('Öğe ekle')}<ChevronDownIcon /></Button>{/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-60">
            <DropdownMenu.Item onSelect={() => openNew('link')}><ExternalLinkIcon />{t('Bağlantı')}</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => openNew('dropdown')}><ChevronDownIcon />{t('Açılır menü')}</DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Label>{t('Sistem sayfaları')}</DropdownMenu.Label>
            {#each a.builtins as b (b.key)}
              <DropdownMenu.Item disabled={builtinUsed.has(b.key)} onSelect={() => addBuiltin(b.key)}>{t(b.label)}<span class="ml-auto text-xs text-muted-foreground">{b.url}</span></DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>



      <div
        class="grid gap-2"
        use:dndzone={{ items: navTree, flipDurationMs: 150, type: 'nav', dropTargetStyle: {} }}
        onconsider={(e) => onTop(e, false)}
        onfinalize={(e) => onTop(e, true)}
      >
        {#each navTree as n (n.uid)}
          <div animate:flip={{ duration: 150 }}>{@render row(n, 0)}</div>
        {/each}
      </div>

      {#if navDirty}
        <div transition:fly={{ y: 20, duration: 200 }} class="sticky bottom-4 z-20 flex items-center gap-3 rounded-xl border bg-popover px-4 py-2.5 shadow-lg">
          <span class="text-sm">{t('Menüde kaydedilmemiş değişiklikler var.')}</span>
          <Button variant="ghost" size="sm" class="ml-auto" onclick={() => (navTree = buildTree())}>{t('Vazgeç')}</Button>
          <Button size="sm" onclick={saveNav} disabled={savingNav}>{#if savingNav}<LoaderIcon class="animate-spin" />{:else}<SaveIcon />{/if}{t('Kaydet')}</Button>
        </div>
      {/if}
    </Tabs.Content>

    <!-- Alt bilgi -->
    <Tabs.Content value="footer" class="grid gap-6 lg:grid-cols-2">
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">{t('Sosyal medya')}</Card.Title>
          <Card.Description>{t('Alt bilginin ortasında ikon olarak gösterilir.')}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-2">
          {#each social as l, i (i)}
            <div class="flex items-center gap-2">
              <BrandIcon platform={l.platform} size={14} badge />
              <Combobox class="w-40 shrink-0" options={a.socialPlatforms.map((p) => ({ value: p.key, label: p.label }))} bind:value={l.platform} />
              <Input bind:value={l.url} placeholder="https://" />
              <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => (social = social.filter((_, k) => k !== i))} title={t('Kaldır')}><Trash2Icon /></Button>
            </div>
          {/each}
          <div><Button variant="outline" size="sm" onclick={() => (social = [...social, { platform: 'discord', url: '' }])}><PlusIcon />{t('Bağlantı ekle')}</Button></div>
        </Card.Content>
      </Card.Root>

      <Card.Root class="lg:col-span-2">
        <Card.Header>
          <Card.Title class="text-base">{t('Alt bilgi bağlantıları')}</Card.Title>
          <Card.Description>{t('Alt bilgide tek sıra halinde gösterilir. Site içi yol (/policies/rules), tam adres (https://…) veya mailto: kullanabilirsiniz.')}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-2">
          {#each footerLinks as l, i (i)}
            <div class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <Input bind:value={l.label} placeholder={t('Ad (ör. Oyun Kuralları)')} maxlength={40} class="sm:w-56" />
              <Input bind:value={l.url} placeholder={t('/policies/rules ya da https://…')} maxlength={500} />
              <label class="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><Switch bind:checked={l.newTab} />{t('Yeni sekme')}</label>
              <Button variant="ghost" size="icon-sm" disabled={i === 0} onclick={() => ([footerLinks[i - 1], footerLinks[i]] = [footerLinks[i]!, footerLinks[i - 1]!])} title={t('Yukarı taşı')}><ChevronUpIcon /></Button>
              <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => (footerLinks = footerLinks.filter((_, k) => k !== i))} title={t('Kaldır')}><Trash2Icon /></Button>
            </div>
          {/each}
          <div>
            <Button variant="outline" size="sm" disabled={footerLinks.length >= 12} onclick={() => (footerLinks = [...footerLinks, { label: '', url: '', newTab: false }])}><PlusIcon />{t('Bağlantı ekle')}</Button>
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Alt bilgi metni ve çerezler')}</Card.Title></Card.Header>
        <Card.Content class="grid gap-4">
          <Field label={t('Sağ alt köşe metni')} hint={t("Telif, tema adı, emeği geçenler… Boş bırakılırsa '© yıl forum adı' yazılır.")}>
            <Textarea bind:value={footerText} rows={2} maxlength={500} />
          </Field>
          <label class="flex items-center gap-3 text-sm"><Switch bind:checked={poweredBy} />{t('"InkForum ile çalışır" bağlantısını göster')}</label>
          <label class="flex items-center gap-3 text-sm"><Switch bind:checked={cookieBanner} />{t('Çerez bilgilendirmesini göster')}</label>
          <Field label={t('Çerez bildirimi metni')}><Textarea bind:value={cookieText} rows={3} maxlength={1000} /></Field>
        </Card.Content>
      </Card.Root>
      <div class="lg:col-span-2">
        <Button onclick={saveFooter} disabled={savingFooter}>{#if savingFooter}<LoaderIcon class="animate-spin" />{:else}<SaveIcon />{/if}{t('Kaydet')}</Button>
      </div>
    </Tabs.Content>
  </Tabs.Root>

  <Dialog.Root bind:open={editOpen}>
    <Dialog.Content class="sm:max-w-lg">
      {#if edit}
        <form class="grid gap-4" onsubmit={applyEdit}>
          <Dialog.Header>
            <Dialog.Title>{editIsNew ? t('Yeni menü öğesi') : t('Menü öğesini düzenle')}</Dialog.Title>
          </Dialog.Header>
          <Field label={t('Ad')} for="n-label"><Input id="n-label" bind:value={edit.label} maxlength={40} required /></Field>
          {#if edit.kind === 'link'}
            <Field label={t('Adres')} for="n-url" hint={t('Site içi (/…), site dışı (https://…) ya da mailto:')}><Input id="n-url" bind:value={edit.url} /></Field>
            <label class="flex items-center gap-3 text-sm"><Switch bind:checked={edit.newTab} />{t('Yeni sekmede aç')}</label>
          {/if}
          {#if edit.kind !== 'dropdown'}
            <label class="flex items-center gap-3 text-sm">
              <Switch checked={edit.style === 'button'} onCheckedChange={(v) => edit && (edit.style = v ? 'button' : 'link')} />{t('Vurgulu buton olarak göster')}
              <span class="text-xs text-muted-foreground">{t('(ör. "UCP", "Market")')}</span>
            </label>
          {/if}
          {#if edit.kind === 'builtin'}
            <p class="text-sm text-muted-foreground">{t('Sistem sayfası:')} <code>{hrefOf(edit)}</code></p>
          {/if}
          <Field label={t('İkon')}><IconPicker bind:name={edit.icon} bind:nodes={edit.iconNodes} withColor={false} /></Field>
          <div class="grid gap-3 sm:grid-cols-2">
            <Field label={t('Kimler görsün?')}><Combobox options={visOptions} bind:value={edit.visibility} /></Field>
            <Field label={t('Gereken yetki')}><Combobox options={permOptions} bind:value={edit.permission} placeholder={t('Yok')} clearable /></Field>
          </div>
          <label class="flex items-center gap-3 text-sm"><Switch bind:checked={edit.isEnabled} />{t('Menüde göster')}</label>
          <Dialog.Footer>
            <Button type="button" variant="ghost" onclick={() => (editOpen = false)}>{t('Vazgeç')}</Button>
            <Button type="submit" disabled={!edit.label.trim()}>{t('Tamam')}</Button>
          </Dialog.Footer>
        </form>
      {/if}
    </Dialog.Content>
  </Dialog.Root>
{/if}
