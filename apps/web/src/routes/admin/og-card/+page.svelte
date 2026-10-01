<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import { DEFAULT_OG_CARD, type OgCard } from '@forum/shared';
  import PageHeaderIcon from 'phosphor-svelte/lib/ShareNetwork';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import * as Card from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SaveBar from '$lib/components/admin/SaveBar.svelte';
  import ColorField from '$lib/components/admin/themes/ColorField.svelte';
  import OptionCards from '$lib/components/admin/themes/OptionCards.svelte';
  import ImageField from '$lib/components/builder/ImageField.svelte';
  import { api, errorMessage } from '$lib/api';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  const settings = $derived(page.data.viewer?.settings ?? {});
  const stored = () => structuredClone(($state.snapshot(page.data.viewer?.settings['seo.ogCard']) as OgCard | undefined) ?? DEFAULT_OG_CARD);
  let card = $state<OgCard>(untrack(stored));
  let saved = $state(untrack(() => JSON.stringify(stored())));
  const dirty = $derived(JSON.stringify(card) !== saved);
  let saving = $state(false);
  let sample = $state<'topic' | 'board' | 'site'>('topic');
  const ogOn = $derived(settings['seo.ogImages'] !== false);

  // Canlı önizleme: sunucu kaydedilmemiş tasarımla PNG çizer (yazarken 350 ms bekler)
  let preview = $state<string | null>(null);
  let loading = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  $effect(() => {
    const body = JSON.stringify({ card, sample });
    clearTimeout(timer);
    timer = setTimeout(() => void draw(body), 350);
  });
  async function draw(body: string) {
    const n = ++seq;
    loading = true;
    try {
      const res = await fetch('/api/admin/seo/og-preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? res.statusText);
      const url = URL.createObjectURL(await res.blob());
      if (n !== seq) return URL.revokeObjectURL(url);
      if (preview) URL.revokeObjectURL(preview);
      preview = url;
    } catch (e) {
      if (n === seq) toast.error(errorMessage(e));
    } finally {
      if (n === seq) loading = false;
    }
  }
  onDestroy(() => {
    clearTimeout(timer);
    if (preview) URL.revokeObjectURL(preview);
  });

  async function save() {
    saving = true;
    try {
      await api.put('/api/admin/seo/og-card', card);
      saved = JSON.stringify(card);
      toast.success(t('Kaydedildi. Discord gibi uygulamalar eski görseli bir süre önbellekte tutabilir.'));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>{t('Paylaşım kartı')}</title></svelte:head>

<PageHeader
  icon={PageHeaderIcon}
  title={t('Paylaşım kartı')}
  description={t('Bağlantınız Discord, X, WhatsApp gibi yerlerde paylaşıldığında görünen önizleme görselini tasarlayın: düzen, arka plan, renkler, yazı tipi ve logo.')}
/>

{#if !ogOn}
  <p class="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
    {t('Otomatik paylaşım görselleri kapalı. Ayarlar → SEO bölümünden açın; kapalıyken site logosu/banner kullanılır.')}
  </p>
{/if}

<div class="grid items-start gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]" data-part="og-card-editor">
  <div class="grid gap-4">
    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Düzen')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-3">
        <OptionCards
          bind:value={card.layout}
          cols={2}
          options={[
            { value: 'classic', label: t('Klasik'), hint: t('Solda başlık') },
            { value: 'centered', label: t('Ortalı'), hint: t('Logo üstte') },
            { value: 'split', label: t('Bölünmüş'), hint: t('Sağda logo paneli') },
            { value: 'minimal', label: t('Sade'), hint: t('Yalnızca büyük başlık') },
          ]}
        />
        <div class="grid gap-1.5 text-sm">
          <span class="font-medium">{t('Yazı tipi')}</span>
          <OptionCards
            bind:value={card.font}
            options={[
              { value: 'sans', label: t('Düz') },
              { value: 'serif', label: t('Tırnaklı') },
              { value: 'mono', label: t('Eş aralıklı') },
            ]}
          />
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Arka plan')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-3">
        <OptionCards
          bind:value={card.background.kind}
          cols={5}
          options={[
            { value: 'dark', label: t('Koyu') },
            { value: 'light', label: t('Açık') },
            { value: 'color', label: t('Renk') },
            { value: 'gradient', label: t('Geçiş') },
            { value: 'image', label: t('Görsel') },
          ]}
        />
        {#if card.background.kind === 'color'}
          <ColorField label={t('Renk')} bind:value={card.background.color} fallback="#111827" clearable={false} />
        {:else if card.background.kind === 'gradient'}
          <ColorField label={t('Başlangıç')} bind:value={card.background.from} fallback="#1e1b4b" clearable={false} />
          <ColorField label={t('Bitiş')} bind:value={card.background.to} fallback="#0f766e" clearable={false} />
          <label class="grid gap-1.5 text-xs font-semibold text-muted-foreground"
            >{t('Açı: {n}°', { n: card.background.angle })}
            <input type="range" min="0" max="360" step="15" bind:value={card.background.angle} class="accent-primary" /></label
          >
        {:else if card.background.kind === 'image'}
          <ImageField bind:value={card.background.image} uploadUrl="/api/admin/home/images" />
          <label class="grid gap-1.5 text-xs font-semibold text-muted-foreground"
            >{t('Karartma: %{n}', { n: card.background.dim })}
            <input type="range" min="0" max="90" step="5" bind:value={card.background.dim} class="accent-primary" /></label
          >
        {/if}
        <div class="grid gap-1.5 text-sm">
          <span class="font-medium">{t('Desen')}</span>
          <OptionCards
            bind:value={card.pattern}
            cols={4}
            options={[
              { value: 'none', label: t('Yok') },
              { value: 'dots', label: t('Nokta') },
              { value: 'grid', label: t('Izgara') },
              { value: 'lines', label: t('Çizgi') },
            ]}
          />
        </div>
        <label class="flex items-center justify-between gap-3 text-sm font-medium">{t('Vurgu renginde ışıma')}<Switch bind:checked={card.glow} /></label>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Renkler')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-3">
        <ColorField label={t('Vurgu rengi')} hint={t('Boş = forumun vurgu rengi')} bind:value={card.accent} fallback={String(settings['appearance.accentColor'] ?? '#7b61ff')} />
        <ColorField label={t('Discord kenar rengi')} hint={t('Önizlemenin solundaki çizgi. Boş = vurgu rengi')} bind:value={card.embedColor} fallback={String(settings['appearance.accentColor'] ?? '#7b61ff')} />
        <div class="grid gap-1.5 text-sm">
          <span class="font-medium">{t('Yazı rengi')}</span>
          <OptionCards
            bind:value={card.text}
            options={[
              { value: 'auto', label: t('Otomatik') },
              { value: 'light', label: t('Açık') },
              { value: 'dark', label: t('Koyu') },
            ]}
          />
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('İçerik')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-3">
        <label class="flex items-center justify-between gap-3 text-sm font-medium">{t('Logo')}<Switch bind:checked={card.logo} /></label>
        {#if card.logo && !String(settings['appearance.logoUrl'] ?? '').startsWith('/uploads/')}
          <p class="text-xs text-muted-foreground">{t('Logo, Görünüm sayfasından yüklenmiş olmalı; yoksa forum adı yazılır.')}</p>
        {/if}
        <label class="flex items-center justify-between gap-3 text-sm font-medium">{t('Üst satır (bölüm / kategori)')}<Switch bind:checked={card.kicker} /></label>
        <label class="flex items-center justify-between gap-3 text-sm font-medium">{t('Alt bilgi (yazar, yanıt sayısı…)')}<Switch bind:checked={card.meta} /></label>
        <label class="grid gap-1.5 text-sm"
          ><span class="font-medium">{t('Alt satır yazısı')}</span>
          <Input bind:value={card.footer} maxlength={60} placeholder={String(settings['general.forumName'] ?? '')} /></label
        >
      </Card.Content>
    </Card.Root>
  </div>

  <div class="grid gap-3 xl:sticky xl:top-20">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold">{t('Önizleme')}</span>
      {#if loading}<LoaderIcon class="size-4 animate-spin text-muted-foreground" />{/if}
      <span class="flex-1"></span>
      <div class="flex rounded-lg bg-muted p-0.5 text-xs">
        {#each [{ v: 'topic', l: t('Konu') }, { v: 'board', l: t('Bölüm') }, { v: 'site', l: t('Ana sayfa') }] as o (o.v)}
          <button
            type="button"
            class={cn('rounded-md px-2.5 py-1 font-semibold', sample === o.v ? 'bg-background shadow-sm' : 'text-muted-foreground')}
            onclick={() => (sample = o.v as typeof sample)}>{o.l}</button
          >
        {/each}
      </div>
    </div>
    <!-- Discord'daki görünüm -->
    <div class="rounded-xl bg-[#2b2d31] p-4 text-[#dbdee1]">
      <div class="max-w-[520px] rounded-[4px] border-l-4 bg-[#232428] p-3 pr-4" style="border-color:{card.embedColor || card.accent || String(settings['appearance.accentColor'] ?? '#7b61ff')}">
        <p class="text-xs text-[#b5bac1]">{String(settings['general.forumName'] ?? '')}</p>
        <p class="mt-1 font-semibold text-[#00a8fc]">{t('Örnek bağlantı başlığı')}</p>
        <p class="mt-1 text-sm">{String(settings['general.forumDescription'] ?? '').slice(0, 110)}</p>
        <div class="mt-3 aspect-[1200/630] overflow-hidden rounded-[4px] bg-black/30">
          {#if preview}<img src={preview} alt={t('Önizleme')} class="size-full object-cover" />{/if}
        </div>
      </div>
    </div>
  </div>
</div>

<SaveBar {dirty} {saving} onsave={save} onreset={() => (card = JSON.parse(saved))} />
