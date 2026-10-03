<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Palette';
  import { invalidate, invalidateAll } from '$app/navigation';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { toast } from 'svelte-sonner';
  import { GLOBAL_PERMISSIONS, type IconNode } from '@forum/shared';
  import ChevronUpIcon from 'phosphor-svelte/lib/CaretUp';
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import Trash2Icon from 'phosphor-svelte/lib/Trash';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import GripVerticalIcon from 'phosphor-svelte/lib/DotsSixVertical';
  import SaveIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import EyeOffIcon from 'phosphor-svelte/lib/EyeSlash';
  import ExternalLinkIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import ChevronDownIcon from 'phosphor-svelte/lib/CaretDown';
  import LayoutTemplateIcon from 'phosphor-svelte/lib/Layout';
  import BrushIcon from 'phosphor-svelte/lib/PaintBrushBroad';
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
  import { t, tc } from '$lib/i18n.svelte';
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

  let accent = $state('#7b61ff');
  let showName = $state(true);
  let bannerHeight = $state(160);
  let bannerEnabled = $state(true);
  let bannerTagline = $state('');
  let bannerColor = $state('#16171b');
  let backgroundDim = $state(80);
  let authLayout = $state<'split' | 'centered' | 'cover'>('split');
  let authSide = $state<'left' | 'right'>('left');
  let authHeadline = $state('');
  let authText = $state('');
  let footerText = $state('');
  let footerLinks = $state<Array<{ label: string; url: string; newTab: boolean }>>([]);
  let cookieBanner = $state(true);
  let poweredBy = $state(true);
  let cookieText = $state('');
  let social = $state<Array<{ platform: string; url: string }>>([]);

  function syncState1() {
    if (!data.settings || !a) return;
    accent = String(settingValue('appearance.accentColor') ?? '#7b61ff');
    showName = settingValue('appearance.showForumName') === true;
    bannerHeight = Number(settingValue('appearance.bannerHeight') ?? 160);
    bannerEnabled = settingValue('appearance.bannerEnabled') !== false;
    bannerTagline = String(settingValue('appearance.bannerTagline') ?? '');
    bannerColor = String(settingValue('appearance.bannerColor') ?? '#16171b');
    backgroundDim = Number(settingValue('appearance.backgroundDim') ?? 80);
    footerText = String(settingValue('appearance.footerText') ?? '');
    footerLinks = a.footerLinks.map((l) => ({ ...l, newTab: !!l.newTab }));
    authLayout = (settingValue('appearance.authLayout') ?? 'split') as typeof authLayout;
    authSide = (settingValue('appearance.authImageSide') ?? 'left') as typeof authSide;
    authHeadline = String(settingValue('appearance.authHeadline') ?? '');
    authText = String(settingValue('appearance.authText') ?? '');
    cookieBanner = settingValue('cookies.bannerEnabled') !== false;
    poweredBy = settingValue('appearance.poweredBy') !== false;
    cookieText = String(settingValue('cookies.bannerText') ?? '');
    social = a.socialLinks.map((l) => ({ ...l }));
    navTree = buildTree();
  }


  let savingBrand = $state(false);
  async function saveBrand() {
    savingBrand = true;
    try {
      await api.put('/api/admin/settings', {
        'appearance.showForumName': showName,
        'appearance.bannerHeight': bannerHeight,
        'appearance.bannerEnabled': bannerEnabled,
        'appearance.bannerTagline': bannerTagline,
        'appearance.bannerColor': bannerColor,
        'appearance.backgroundDim': backgroundDim,
        'appearance.authLayout': authLayout,
        'appearance.authImageSide': authSide,
        'appearance.authHeadline': authHeadline,
        'appearance.authText': authText,
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
        {tc(n.label)}
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
      <!-- Tema: tema stüdyosunda -->
      <section class="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5" data-part="active-theme">
        <span class="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><BrushIcon class="size-6" weight="duotone" /></span>
        <div class="min-w-0 flex-1">
          <h2 class="font-bold">{t('Tema, renkler ve yazı tipi')}</h2>
          <p class="text-sm text-muted-foreground">{t('Renkler, açık / koyu mod, yazı tipi, köşeler, üst alan düzeni ve forum listesi artık Temalar ekranında, canlı önizlemeyle düzenleniyor.')}</p>
        </div>
        <Button href="/admin/themes"><BrushIcon />{t('Temaları aç')}</Button>
      </section>

      <div class="grid gap-6 lg:grid-cols-2">
        <Card.Root>
          <Card.Header><Card.Title class="text-base">{t('Üst alan ve banner')}</Card.Title></Card.Header>
          <Card.Content class="grid gap-5">
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

      <!-- Giriş ve kayıt sayfası -->
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-base">{t('Giriş ve kayıt sayfası')}</Card.Title>
          <Card.Description>{t('Giriş, kayıt ve şifre sayfalarının düzeni. Görsel yüklemediyseniz sade koyu bir zemin kullanılır.')}</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-5">
          <div class="grid gap-3 sm:grid-cols-3">
            {#each [{ v: 'split', l: t('Bölünmüş'), d: t('Bir yanda görsel, diğer yanda form') }, { v: 'centered', l: t('Ortada kart'), d: t('Sade zeminde ortalanmış form') }, { v: 'cover', l: t('Tam ekran'), d: t('Tüm ekran görsel, üstünde form kartı') }] as o (o.v)}
              <button type="button" onclick={() => (authLayout = o.v as typeof authLayout)} class={cn('grid gap-2 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent', authLayout === o.v && 'border-primary bg-primary-soft')}>
                <div class="relative flex h-16 overflow-hidden rounded border bg-muted/40">
                  {#if o.v === 'split'}
                    <span class={cn('w-1/2', authSide === 'right' && 'order-2')} style="background:color-mix(in oklab, {accent} 25%, #0d0f13)"></span>
                    <span class="flex flex-1 items-center justify-center"><span class="h-9 w-12 rounded-sm border bg-card"></span></span>
                  {:else if o.v === 'centered'}
                    <span class="flex flex-1 items-center justify-center"><span class="h-11 w-14 rounded-md border bg-card shadow-sm"></span></span>
                  {:else}
                    <span class="absolute inset-0" style="background:color-mix(in oklab, {accent} 25%, #0d0f13)"></span>
                    <span class="relative ml-auto mr-2 self-center h-12 w-14 rounded-md border bg-card/95"></span>
                  {/if}
                </div>
                <span class="text-sm font-semibold">{o.l}<span class="block text-xs font-normal text-muted-foreground">{o.d}</span></span>
              </button>
            {/each}
          </div>
          {#if authLayout === 'split'}
            <Field label={t('Görselin yeri')}>
              <div class="flex w-fit gap-1 rounded-lg bg-muted p-1">
                {#each [{ v: 'left', l: t('Solda') }, { v: 'right', l: t('Sağda') }] as o (o.v)}
                  <button type="button" class={cn(segBtn, authSide === o.v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')} onclick={() => (authSide = o.v as typeof authSide)}>{o.l}</button>
                {/each}
              </div>
            </Field>
          {/if}
          {#if authLayout !== 'centered'}
            <div class="grid gap-4 md:grid-cols-2">
              <Field label={t('Başlık')} hint={t('Boşsa "{name} topluluğuna hoş geldin".', { name: String(settingValue('general.forumName') ?? 'Forum') })}>
                <Input bind:value={authHeadline} maxlength={120} />
              </Field>
              <Field label={t('Alt yazı')} hint={t('Boşsa forum açıklaması kullanılır.')}>
                <Input bind:value={authText} maxlength={300} />
              </Field>
            </div>
          {/if}
          <div class="flex flex-wrap items-center gap-2">
            <Button onclick={saveBrand} disabled={savingBrand}>{#if savingBrand}<LoaderIcon class="animate-spin" />{:else}<SaveIcon />{/if}{t('Kaydet')}</Button>
          </div>
        </Card.Content>
      </Card.Root>
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
