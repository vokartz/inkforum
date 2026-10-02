<script lang="ts">
  import { guardUnsaved } from '$lib/leave-guard';
  import {
    activeThemeOf,
    effectivePalette,
    FONT_OPTIONS,
    PALETTE_KEYS,
    PALETTE_LABELS,
    THEME_HTML_LABELS,
    THEME_HTML_SLOTS,
    themeSettingValues,
    type ThemeConfig,
    type ThemeDetail,
    type ThemeHtmlSlot,
  } from '@forum/shared';
  import { onMount } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import FloppyIcon from 'phosphor-svelte/lib/FloppyDisk';
  import CheckIcon from 'phosphor-svelte/lib/CheckCircle';
  import UndoIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
  import DesktopIcon from 'phosphor-svelte/lib/Desktop';
  import TabletIcon from 'phosphor-svelte/lib/DeviceTablet';
  import PhoneIcon from 'phosphor-svelte/lib/DeviceMobile';
  import MoonIcon from 'phosphor-svelte/lib/Moon';
  import SunIcon from 'phosphor-svelte/lib/Sun';
  import ArrowClockwiseIcon from 'phosphor-svelte/lib/ArrowClockwise';
  import SwatchesIcon from 'phosphor-svelte/lib/Swatches';
  import PaletteIcon from 'phosphor-svelte/lib/Palette';
  import TextIcon from 'phosphor-svelte/lib/TextAa';
  import ShapesIcon from 'phosphor-svelte/lib/Shapes';
  import BrowsersIcon from 'phosphor-svelte/lib/Browsers';
  import LayoutIcon from 'phosphor-svelte/lib/Layout';
  import ListIcon from 'phosphor-svelte/lib/ListBullets';
  import ImageIcon from 'phosphor-svelte/lib/ImageSquare';
  import SparkleIcon from 'phosphor-svelte/lib/Sparkle';
  import CodeIcon from 'phosphor-svelte/lib/Code';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import Field from '$lib/components/Field.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import ColorField from '$lib/components/admin/themes/ColorField.svelte';
  import OptionCards from '$lib/components/admin/themes/OptionCards.svelte';
  import { api, errorMessage } from '$lib/api';
  import { THEME_PREVIEW_KEY, THEME_PREVIEW_MESSAGE } from '$lib/theme-preview';
  import { can } from '$lib/viewer';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();

  // Düzenlenen taslak (kaydedilene kadar yalnızca önizlemede)
  let name = $state('');
  let description = $state('');
  let config = $state<ThemeConfig>(null as unknown as ThemeConfig);
  let css = $state('');
  let html = $state<Record<ThemeHtmlSlot, string>>({
    beforeHeader: '',
    afterHeader: '',
    beforeFooter: '',
    afterFooter: '',
  });
  let saved = $state('');
  let saving = $state(false);
  let current = $state<ThemeDetail | null>(null);

  function load(th: ThemeDetail) {
    current = th;
    name = th.name;
    description = th.description;
    config = structuredClone(th.config);
    css = th.css;
    html = { ...th.html };
    saved = snapshot();
  }
  const snapshot = () => JSON.stringify({ name, description, config, css, html });
  $effect.pre(() => {
    if (data.theme && data.theme.id !== current?.id) load(data.theme);
  });
  const dirty = $derived(!!config && snapshot() !== saved);
  const codeAllowed = $derived(can(data.viewer, 'admin.customCode'));

  // ---------- Bölümler ----------
  type Section =
    | 'general'
    | 'colors'
    | 'type'
    | 'shape'
    | 'header'
    | 'layout'
    | 'list'
    | 'background'
    | 'effects'
    | 'code';
  let section = $state<Section>('general');
  const SECTIONS = $derived<Array<{ key: Section; label: string; icon: typeof PaletteIcon }>>([
    { key: 'general', label: t('Genel'), icon: SwatchesIcon },
    { key: 'colors', label: t('Renkler'), icon: PaletteIcon },
    { key: 'type', label: t('Yazı'), icon: TextIcon },
    { key: 'shape', label: t('Şekil'), icon: ShapesIcon },
    { key: 'header', label: t('Üst alan'), icon: BrowsersIcon },
    { key: 'layout', label: t('Düzen'), icon: LayoutIcon },
    { key: 'list', label: t('Forum listesi'), icon: ListIcon },
    { key: 'background', label: t('Arka plan'), icon: ImageIcon },
    { key: 'effects', label: t('Efektler'), icon: SparkleIcon },
    { key: 'code', label: t('CSS ve HTML'), icon: CodeIcon },
  ]);

  const ACCENTS = [
    '#7b61ff',
    '#3b82f6',
    '#06b6d4',
    '#10b981',
    '#22c55e',
    '#eab308',
    '#f59e0b',
    '#f97316',
    '#ef4444',
    '#e11d48',
    '#ec4899',
    '#9c9c9c',
  ];
  let paletteMode = $state<'light' | 'dark'>('dark');
  const fonts = $derived(FONT_OPTIONS.map((f) => ({ value: f.key, label: f.label })));

  // ---------- Canlı önizleme ----------
  let frame = $state<HTMLIFrameElement | null>(null);
  let device = $state<'desktop' | 'tablet' | 'phone'>('desktop');
  let previewMode = $state<'light' | 'dark'>('dark');
  let previewPath = $state('/');
  const pages = $derived([
    { value: '/', label: t('Ana sayfa') },
    ...(data.boardPath ? [{ value: data.boardPath, label: t('Bölüm') }] : []),
    { value: '/members', label: t('Üyeler') },
    { value: '/search', label: t('Arama') },
  ]);
  let frameSrc = $state('/');

  function pushPreview() {
    if (!config || !current) return;
    const active = activeThemeOf({
      id: current.id,
      name,
      config: $state.snapshot(config),
      css,
      html: $state.snapshot(html),
    });
    // Önizlemede seçilen mod zorlanır (temada mod seçimi açık olsa bile)
    active.options = { ...active.options, mode: { default: previewMode, toggle: false } };
    const settings = {
      ...themeSettingValues($state.snapshot(config)),
      'appearance.defaultMode': previewMode,
    };
    try {
      sessionStorage.setItem(THEME_PREVIEW_KEY, JSON.stringify({ active, settings }));
      frame?.contentWindow?.postMessage({ type: THEME_PREVIEW_MESSAGE }, location.origin);
    } catch {
      /* depolama kapalı */
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    void snapshot();
    void previewMode;
    clearTimeout(timer);
    timer = setTimeout(pushPreview, 200);
  });
  onMount(() => {
    if (config) previewMode = config.mode.default === 'light' ? 'light' : 'dark';
    paletteMode = previewMode;
    frameSrc = previewPath;
    return () => {
      try {
        sessionStorage.removeItem(THEME_PREVIEW_KEY);
      } catch {
        /* yoksay */
      }
    };
  });

  guardUnsaved(() => dirty);

  async function save(activate = false) {
    if (!current) return;
    saving = true;
    try {
      const res = await api.put<ThemeDetail>(`/api/admin/themes/${current.id}`, {
        name,
        description,
        config: $state.snapshot(config),
        css,
        html: $state.snapshot(html),
      });
      if (activate) await api.post(`/api/admin/themes/${current.id}/activate`);
      load({ ...res, active: res.active || activate });
      toast.success(activate ? t('Kaydedildi ve etkinleştirildi.') : t('Tema kaydedildi.'));
      await Promise.all([invalidate('app:admin-theme'), invalidate('app:viewer')]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }
  function revert() {
    if (current) load(current);
  }

  const pal = $derived(config ? effectivePalette(config, paletteMode) : null);
  /** Arka plan zemini otomatik ise paletin rengi */
  const bgFallback = $derived(config ? effectivePalette(config, previewMode).background : '#000000');
</script>

<svelte:head><title>{name || t('Tema')} · {t('Tema stüdyosu')}</title></svelte:head>

{#if config && current}
  <div class="-mx-4 -my-6 flex h-[calc(100dvh-4rem)] flex-col sm:-mx-6 sm:-my-8" data-part="theme-studio">
    <!-- Üst çubuk -->
    <header class="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2.5">
      <Button variant="ghost" size="icon-sm" href="/admin/themes" aria-label={t('Temalar')}
        ><ArrowLeftIcon /></Button
      >
      <Input bind:value={name} maxlength={60} class="h-9 w-56 font-semibold" aria-label={t('Tema adı')} />
      {#if current.active}<span
          class="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success"
          ><CheckIcon class="size-3.5" weight="fill" />{t('Etkin tema')}</span
        >{/if}
      {#if dirty}<span class="text-xs text-muted-foreground">{t('Kaydedilmemiş değişiklikler')}</span>{/if}
      <span class="flex-1"></span>
      <Button variant="ghost" size="sm" disabled={!dirty || saving} onclick={revert}
        ><UndoIcon />{t('Geri al')}</Button
      >
      <Button
        variant={current.active ? 'default' : 'outline'}
        size="sm"
        disabled={saving || (!dirty && current.active)}
        onclick={() => save(false)}><FloppyIcon />{t('Kaydet')}</Button
      >
      {#if !current.active}<Button size="sm" disabled={saving} onclick={() => save(true)}
          ><CheckIcon />{t('Kaydet ve etkinleştir')}</Button
        >{/if}
    </header>

    <div class="grid min-h-0 flex-1 grid-cols-[3.25rem_22rem_minmax(0,1fr)]">
      <!-- Bölüm sekmeleri -->
      <nav
        class="flex flex-col items-center gap-1 overflow-y-auto border-r bg-card py-2"
        aria-label={t('Tema ayarları')}
      >
        {#each SECTIONS as s (s.key)}
          <button
            type="button"
            onclick={() => (section = s.key)}
            class={cn(
              'flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              section === s.key && 'bg-primary-soft text-primary',
            )}
            title={s.label}
            aria-label={s.label}
            aria-current={section === s.key}
          >
            <s.icon class="size-5" />
          </button>
        {/each}
      </nav>

      <!-- Ayarlar -->
      <aside class="overflow-y-auto border-r bg-card" data-part="theme-controls">
        <h2 class="sticky top-0 z-10 border-b bg-card px-4 py-3 text-sm font-bold">
          {SECTIONS.find((s) => s.key === section)?.label}
        </h2>
        <div class="grid gap-5 p-4">
          {#if section === 'general'}
            <Field label={t('Açıklama')}><Input bind:value={description} maxlength={200} /></Field>
            <Field
              label={t('Temel düzen')}
              hint={t(
                'Varsayılan renkler ve üst alan buna göre gelir; her şeyi aşağıdan değiştirebilirsiniz.',
              )}
            >
              <OptionCards
                bind:value={config.base}
                cols={2}
                options={[
                  { value: 'modern', label: t('Modern'), hint: t('Sade, koyu') },
                  { value: 'community', label: t('Topluluk'), hint: t('Bannerlı, IPS tarzı') },
                ]}
              />
            </Field>
            <Field
              label={t('Vurgu rengi')}
              hint={t('Düğmeler, bağlantılar, etkin menü ve okunmamış işaretleri.')}
            >
              <div class="grid gap-2.5">
                <div class="flex flex-wrap gap-1.5">
                  {#each ACCENTS as a (a)}
                    <button
                      type="button"
                      class={cn(
                        'size-7 rounded-full transition-transform hover:scale-110',
                        config.accent === a && 'ring-2 ring-ring ring-offset-2 ring-offset-card',
                      )}
                      style="background:{a}"
                      aria-label={a}
                      onclick={() => (config.accent = a)}
                    ></button>
                  {/each}
                </div>
                <ColorField
                  label={t('Özel renk')}
                  bind:value={config.accent}
                  fallback="#7b61ff"
                  clearable={false}
                />
              </div>
            </Field>
            <Field label={t('Renk modu')}>
              <OptionCards
                bind:value={config.mode.default}
                options={[
                  { value: 'dark', label: t('Koyu') },
                  { value: 'light', label: t('Açık') },
                  { value: 'system', label: t('Cihaza göre') },
                ]}
              />
            </Field>
            <label class="flex items-start gap-3 text-sm"
              ><Switch bind:checked={config.mode.toggle} class="mt-0.5" /><span
                >{t('Üyeler açık / koyu mod arasında geçiş yapabilsin')}<span
                  class="block text-xs text-muted-foreground"
                  >{t('Kapalıysa herkes yalnızca seçtiğiniz modu görür ve mod düğmesi gizlenir.')}</span
                ></span
              ></label
            >
          {:else if section === 'colors' && pal}
            <div class="flex rounded-lg bg-muted p-1 text-sm">
              {#each [{ v: 'dark', l: t('Koyu mod'), i: MoonIcon }, { v: 'light', l: t('Açık mod'), i: SunIcon }] as o (o.v)}
                <button
                  type="button"
                  class={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium',
                    paletteMode === o.v ? 'bg-background shadow-sm' : 'text-muted-foreground',
                  )}
                  onclick={() => (
                    (paletteMode = o.v as 'light' | 'dark'),
                    (previewMode = o.v as 'light' | 'dark')
                  )}
                >
                  <o.i class="size-4" />{o.l}
                </button>
              {/each}
            </div>
            <p class="-mt-2 text-xs text-muted-foreground">
              {t(
                'Boş bıraktığınız renkler temel temadan gelir (soluk yazılı değer). Sıfırlamak için × düğmesine basın.',
              )}
            </p>
            <div class="grid gap-3.5">
              {#each PALETTE_KEYS as k (k)}
                <ColorField
                  label={t(PALETTE_LABELS[k].label)}
                  hint={PALETTE_LABELS[k].hint ? t(PALETTE_LABELS[k].hint) : ''}
                  bind:value={config[paletteMode][k]}
                  fallback={pal[k]}
                />
              {/each}
            </div>
          {:else if section === 'type'}
            <Field label={t('Yazı tipi')}
              ><NativeSelect bind:value={config.typography.font} options={fonts} /></Field
            >
            <Field label={t('Başlık yazı tipi')}
              ><NativeSelect
                bind:value={config.typography.headingFont}
                options={[{ value: 'same', label: t('Metinle aynı') }, ...fonts]}
              /></Field
            >
            <Field label={t('Yazı boyutu: {n}px', { n: config.typography.size })}>
              <input
                type="range"
                min={13}
                max={18}
                step={1}
                bind:value={config.typography.size}
                class="w-full accent-[var(--primary)]"
              />
            </Field>
            <Field label={t('Başlık kalınlığı')}>
              <OptionCards
                bind:value={config.typography.headingWeight}
                cols={4}
                options={[
                  { value: 600, label: t('Orta') },
                  { value: 700, label: t('Kalın') },
                  { value: 800, label: t('Daha kalın') },
                  { value: 900, label: t('Siyah') },
                ]}
              />
            </Field>
            <Field label={t('Başlık harfleri')}
              ><OptionCards
                bind:value={config.typography.headingCase}
                cols={2}
                options={[
                  { value: 'none', label: t('Normal') },
                  { value: 'uppercase', label: t('BÜYÜK HARF') },
                ]}
              /></Field
            >
            <Field label={t('Harf aralığı')}
              ><OptionCards
                bind:value={config.typography.letterSpacing}
                options={[
                  { value: 'tight', label: t('Sık') },
                  { value: 'normal', label: t('Normal') },
                  { value: 'wide', label: t('Geniş') },
                ]}
              /></Field
            >
          {:else if section === 'shape'}
            <Field label={t('Köşe yuvarlaklığı')}>
              <OptionCards
                bind:value={config.shape.radius}
                cols={5}
                options={[
                  { value: 'none', label: t('Yok') },
                  { value: 'sm', label: 'S' },
                  { value: 'md', label: 'M' },
                  { value: 'lg', label: 'L' },
                  { value: 'xl', label: 'XL' },
                ]}
              />
            </Field>
            <Field label={t('Kart görünümü')}>
              <OptionCards
                bind:value={config.shape.cards}
                cols={2}
                options={[
                  { value: 'bordered', label: t('Kenarlıklı'), hint: t('İnce çizgi') },
                  { value: 'elevated', label: t('Gölgeli'), hint: t('Havada') },
                  { value: 'flat', label: t('Düz'), hint: t('Kenarlıksız') },
                  { value: 'glass', label: t('Cam'), hint: t('Yarı saydam, bulanık') },
                ]}
              />
            </Field>
            <Field label={t('Gölge')}
              ><OptionCards
                bind:value={config.shape.shadow}
                cols={4}
                options={[
                  { value: 'none', label: t('Yok') },
                  { value: 'soft', label: t('Hafif') },
                  { value: 'medium', label: t('Orta') },
                  { value: 'strong', label: t('Güçlü') },
                ]}
              /></Field
            >
            <Field label={t('Kenarlık kalınlığı')}
              ><OptionCards
                bind:value={config.shape.border}
                options={[
                  { value: 0, label: t('Yok') },
                  { value: 1, label: '1px' },
                  { value: 2, label: '2px' },
                ]}
              /></Field
            >
          {:else if section === 'header'}
            <Field label={t('Üst alan düzeni')}>
              <OptionCards
                bind:value={config.header.style}
                cols={1}
                options={[
                  {
                    value: 'topbar',
                    label: t('İnce üst çubuk'),
                    hint: t('Logo, menü ve hesap tek satırda (banner açıksa üstünde)'),
                  },
                  {
                    value: 'banner',
                    label: t('Banner + menü çubuğu'),
                    hint: t('Büyük banner, altında menü'),
                  },
                  {
                    value: 'centered',
                    label: t('Ortalanmış logo'),
                    hint: t('Logo ortada, altında ortalanmış menü'),
                  },
                ]}
              />
            </Field>
            <Field label={t('Menü görünümü')}
              ><OptionCards
                bind:value={config.header.nav}
                options={[
                  { value: 'pill', label: t('Hap') },
                  { value: 'underline', label: t('Alt çizgi') },
                  { value: 'tab', label: t('Sekme') },
                ]}
              /></Field
            >
            <Field label={t('Yükseklik')}
              ><OptionCards
                bind:value={config.header.height}
                options={[
                  { value: 'compact', label: t('İnce') },
                  { value: 'normal', label: t('Normal') },
                  { value: 'tall', label: t('Yüksek') },
                ]}
              /></Field
            >
            <label class="flex items-center gap-3 text-sm"
              ><Switch bind:checked={config.header.sticky} />{t('Kaydırınca menü üstte sabit kalsın')}</label
            >
            <label class="flex items-center gap-3 text-sm"
              ><Switch bind:checked={config.header.blur} />{t('Menü çubuğu yarı saydam (bulanık)')}</label
            >
            <p class="text-xs text-muted-foreground">
              {t('Logo, banner görseli ve menü öğeleri Görünüm sayfasından yönetilir.')}
              <a href="/admin/appearance" class="font-semibold text-link hover:underline">{t('Görünüm')}</a>
            </p>
          {:else if section === 'layout'}
            <Field label={t('Sayfa genişliği')}
              ><OptionCards
                bind:value={config.layout.width}
                cols={4}
                options={[
                  { value: 'narrow', label: t('Dar') },
                  { value: 'normal', label: t('Normal') },
                  { value: 'wide', label: t('Geniş') },
                  { value: 'full', label: t('Tam') },
                ]}
              /></Field
            >
            <Field label={t('Yan sütun (ana sayfa)')}
              ><OptionCards
                bind:value={config.layout.sidebar}
                options={[
                  { value: 'left', label: t('Solda') },
                  { value: 'right', label: t('Sağda') },
                  { value: 'hidden', label: t('Gizli') },
                ]}
              /></Field
            >
            <Field label={t('Yoğunluk')}
              ><OptionCards
                bind:value={config.layout.density}
                options={[
                  { value: 'compact', label: t('Sık') },
                  { value: 'comfortable', label: t('Rahat') },
                  { value: 'spacious', label: t('Ferah') },
                ]}
              /></Field
            >
            <Field label={t('Konularda mesaj düzeni')}
              ><OptionCards
                bind:value={config.layout.postLayout}
                cols={2}
                options={[
                  { value: 'side', label: t('Yazar solda') },
                  { value: 'top', label: t('Yazar üstte') },
                ]}
              /></Field
            >
          {:else if section === 'list'}
            <Field label={t('Forum listesi düzeni')}>
              <OptionCards
                bind:value={config.forumList.style}
                cols={1}
                options={[
                  {
                    value: 'table',
                    label: t('Tablo'),
                    hint: t('Simge, ad, konu ve mesaj sayısı, son mesaj'),
                  },
                  { value: 'cards', label: t('Kartlar'), hint: t('Her bölüm ayrı kart, iki sütun') },
                  {
                    value: 'compact',
                    label: t('Sıkışık liste'),
                    hint: t('Tek satır; çok bölümlü forumlar için'),
                  },
                ]}
              />
            </Field>
            <Field label={t('Bölüm simgeleri')}
              ><OptionCards
                bind:value={config.forumList.icons}
                options={[
                  { value: 'large', label: t('Büyük') },
                  { value: 'small', label: t('Küçük') },
                  { value: 'hidden', label: t('Gizli') },
                ]}
              /></Field
            >
            <Field label={t('Kategori başlığı')}
              ><OptionCards
                bind:value={config.forumList.categoryHeader}
                cols={2}
                options={[
                  { value: 'plain', label: t('Sade') },
                  { value: 'tinted', label: t('Renkli zemin') },
                  { value: 'filled', label: t('Vurgu rengi') },
                  { value: 'underline', label: t('Alt çizgi') },
                ]}
              /></Field
            >
            <label class="flex items-center gap-3 text-sm"
              ><Switch bind:checked={config.forumList.counts} />{t('Konu ve mesaj sayılarını göster')}</label
            >
            <label class="flex items-center gap-3 text-sm"
              ><Switch bind:checked={config.forumList.lastPost} />{t('Son mesajı göster')}</label
            >
          {:else if section === 'background'}
            <Field label={t('Sayfa arka planı')}
              ><OptionCards
                bind:value={config.background.kind}
                cols={4}
                options={[
                  { value: 'none', label: t('Düz') },
                  { value: 'gradient', label: t('Geçiş') },
                  { value: 'pattern', label: t('Desen') },
                  { value: 'image', label: t('Görsel') },
                ]}
              /></Field
            >
            {#if config.background.kind === 'gradient'}
              <ColorField
                label={t('Başlangıç rengi')}
                bind:value={config.background.from}
                fallback={bgFallback}
              />
              <ColorField label={t('Bitiş rengi')} bind:value={config.background.to} fallback={bgFallback} />
              <Field label={t('Açı: {n}°', { n: config.background.angle })}
                ><input
                  type="range"
                  min={0}
                  max={360}
                  step={5}
                  bind:value={config.background.angle}
                  class="w-full accent-[var(--primary)]"
                /></Field
              >
            {:else if config.background.kind === 'pattern'}
              <Field label={t('Desen')}
                ><OptionCards
                  bind:value={config.background.pattern}
                  cols={4}
                  options={[
                    { value: 'dots', label: t('Nokta') },
                    { value: 'grid', label: t('Izgara') },
                    { value: 'diagonal', label: t('Çizgi') },
                    { value: 'waves', label: t('Halka') },
                  ]}
                /></Field
              >
              <ColorField
                label={t('Desen rengi')}
                bind:value={config.background.from}
                fallback={config.accent}
              />
            {:else if config.background.kind === 'image'}
              <Field
                label={t('Görsel adresi')}
                hint={t(
                  'https:// adresi ya da Görünüm → Görseller bölümünden yüklediğiniz dosyanın adresi (/uploads/…).',
                )}
              >
                <Input bind:value={config.background.image} placeholder="https://…" />
              </Field>
              <Field label={t('Karartma: %{n}', { n: config.background.dim })}
                ><input
                  type="range"
                  min={0}
                  max={95}
                  step={5}
                  bind:value={config.background.dim}
                  class="w-full accent-[var(--primary)]"
                /></Field
              >
            {/if}
            {#if config.background.kind !== 'none'}
              <label class="flex items-center gap-3 text-sm"
                ><Switch bind:checked={config.background.fixed} />{t(
                  'Kaydırırken arka plan sabit kalsın',
                )}</label
              >
            {/if}
          {:else if section === 'effects'}
            <label class="flex items-start gap-3 text-sm"
              ><Switch bind:checked={config.effects.animations} class="mt-0.5" /><span
                >{t('Animasyonlar')}<span class="block text-xs text-muted-foreground"
                  >{t('Kapalıysa sayfa geçişleri ve beliren içerik animasyonları çalışmaz.')}</span
                ></span
              ></label
            >
            <label class="flex items-start gap-3 text-sm"
              ><Switch bind:checked={config.effects.hoverLift} class="mt-0.5" /><span
                >{t('Satırların üzerine gelince kaydır')}</span
              ></label
            >
            <Field
              label={t('Vurgu renginin yüzeylere yansıması: {n}', { n: config.effects.tint })}
              hint={t('0 = yalnızca düğmeler. Palette özel renk verdiğiniz yüzeyleri etkilemez.')}
            >
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                bind:value={config.effects.tint}
                class="w-full accent-[var(--primary)]"
              />
            </Field>
          {:else if section === 'code'}
            {#if !codeAllowed}
              <p class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                {t(
                  'Özel CSS ve HTML yalnızca "Özel kod" yetkisi olan yöneticiler tarafından değiştirilebilir.',
                )}
              </p>
            {/if}
            <Field
              label={t('Özel CSS')}
              hint={t(
                'Temanın sonuna eklenir. Bileşenleri [data-part="…"] kancalarıyla seçebilirsiniz (ör. [data-part="board-row"]). Değişkenler: --primary, --background, --card, --radius…',
              )}
            >
              <Textarea
                bind:value={css}
                rows={12}
                disabled={!codeAllowed}
                spellcheck={false}
                class="font-mono text-xs"
                placeholder={'[data-part="category"] {\n  border-width: 2px;\n}'}
              />
            </Field>
            {#each THEME_HTML_SLOTS as slot (slot)}
              <Field
                label={t(THEME_HTML_LABELS[slot])}
                hint={slot === 'afterHeader'
                  ? t('Duyuru, sunucu durumu kutusu, sayaç… HTML ve <script> kullanılabilir.')
                  : null}
              >
                <Textarea
                  bind:value={html[slot]}
                  rows={4}
                  disabled={!codeAllowed}
                  spellcheck={false}
                  class="font-mono text-xs"
                />
              </Field>
            {/each}
          {/if}
        </div>
      </aside>

      <!-- Önizleme -->
      <section class="flex min-w-0 flex-col bg-muted/40" data-part="theme-preview">
        <div class="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
          <NativeSelect
            bind:value={previewPath}
            options={pages}
            onchange={() => (frameSrc = previewPath)}
            class="w-44"
            aria-label={t('Önizlenen sayfa')}
          />
          <div class="flex rounded-lg bg-muted p-0.5">
            {#each [{ v: 'desktop', i: DesktopIcon, l: t('Masaüstü') }, { v: 'tablet', i: TabletIcon, l: t('Tablet') }, { v: 'phone', i: PhoneIcon, l: t('Telefon') }] as d (d.v)}
              <button
                type="button"
                class={cn(
                  'rounded-md p-1.5',
                  device === d.v ? 'bg-background shadow-sm' : 'text-muted-foreground',
                )}
                onclick={() => (device = d.v as typeof device)}
                title={d.l}
                aria-label={d.l}><d.i class="size-4" /></button
              >
            {/each}
          </div>
          <div class="flex rounded-lg bg-muted p-0.5">
            {#each [{ v: 'dark', i: MoonIcon, l: t('Koyu') }, { v: 'light', i: SunIcon, l: t('Açık') }] as m (m.v)}
              <button
                type="button"
                class={cn(
                  'rounded-md p-1.5',
                  previewMode === m.v ? 'bg-background shadow-sm' : 'text-muted-foreground',
                )}
                onclick={() => (previewMode = m.v as 'light' | 'dark')}
                title={m.l}
                aria-label={m.l}><m.i class="size-4" /></button
              >
            {/each}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onclick={() => frame?.contentWindow?.location.reload()}
            title={t('Yenile')}
            aria-label={t('Yenile')}><ArrowClockwiseIcon /></Button
          >
          <span class="ml-auto hidden text-xs text-muted-foreground xl:inline"
            >{t('Önizleme yalnızca sizde görünür; kaydedince yayına alınır.')}</span
          >
        </div>
        <div class="flex min-h-0 flex-1 justify-center overflow-auto p-3">
          <iframe
            bind:this={frame}
            src={frameSrc}
            title={t('Tema önizlemesi')}
            onload={pushPreview}
            class="h-full rounded-lg border bg-background shadow-lift transition-[width] duration-300"
            style="width:{device === 'desktop' ? '100%' : device === 'tablet' ? '820px' : '390px'}"
          ></iframe>
        </div>
      </section>
    </div>
  </div>
{/if}
