<script lang="ts">
  import { BUILDER_BLOCKS, type BuilderBlock } from '@forum/shared';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUp';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import Editor from '$lib/components/editor/Editor.svelte';
  import CodeEditor from '$lib/components/CodeEditor.svelte';
  import IconPicker from '$lib/components/IconPicker.svelte';
  import { cn } from '$lib/utils';
  import { api, errorMessage } from '$lib/api';
  import { toast } from 'svelte-sonner';
  import ImageField from './ImageField.svelte';
  import ButtonsField from './ButtonsField.svelte';
  import { t } from '$lib/i18n.svelte';

  let { block = $bindable(), canCode, groups }: { block: BuilderBlock; canCode: boolean; groups: Array<{ id: number; name: string }> } = $props();
  let tab = $state<'content' | 'style'>('content');

  const BGS = [
    { v: 'none', l: 'Yok', css: 'transparent' },
    { v: 'muted', l: 'Soluk', css: 'var(--muted)' },
    { v: 'card', l: 'Kart', css: 'var(--card)' },
    { v: 'accent', l: 'Vurgu', css: 'var(--primary)' },
    { v: 'dark', l: 'Koyu', css: '#09090b' },
    { v: 'image', l: 'Görsel', css: 'linear-gradient(135deg,#555,#999)' },
  ] as const;
  const seg = (on: boolean) => cn('flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors', on ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground');

  // datetime-local <-> ms
  const toLocal = (ms: number) => {
    const d = new Date(ms || Date.now());
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };
  const SOCIALS = ['discord', 'youtube', 'instagram', 'tiktok', 'twitch', 'kick', 'x', 'facebook', 'telegram', 'whatsapp', 'reddit', 'steam', 'spotify', 'github', 'website'];

  // Galeriye toplu yükleme
  async function uploadMany(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])].filter((f) => f.type.startsWith('image/'));
    input.value = '';
    for (const f of files) {
      if (block.type !== 'gallery' || block.images.length >= 40) break;
      try {
        const { url } = await api.upload<{ url: string }>('/api/admin/pages/images', f, f.name);
        if (block.type === 'gallery') block.images = [...block.images, { url, caption: '' }];
      } catch (err) {
        toast.error(errorMessage(err));
      }
    }
  }

  function move<T>(list: T[], i: number): T[] {
    if (i <= 0) return list;
    const copy = [...list];
    [copy[i - 1], copy[i]] = [copy[i]!, copy[i - 1]!];
    return copy;
  }
</script>

{#snippet label(text: string)}<span class="text-xs font-semibold text-muted-foreground">{text}</span>{/snippet}

<div class="grid gap-4" data-part="block-inspector">
  <div class="flex rounded-lg bg-muted p-1">
    <button type="button" class={seg(tab === 'content')} onclick={() => (tab = 'content')}>{t('İçerik')}</button>
    <button type="button" class={seg(tab === 'style')} onclick={() => (tab = 'style')}>{t('Görünüm')}</button>
  </div>

  {#if tab === 'content'}
    <div class="grid gap-3.5">
      {#if block.type === 'hero'}
        <label class="grid gap-1.5">{@render label(t('Üst etiket'))}<Input bind:value={block.eyebrow} maxlength={60} placeholder={t('ör. Sezon 5 başladı')} /></label>
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Textarea bind:value={block.title} rows={2} maxlength={160} /></label>
        <label class="grid gap-1.5">{@render label(t('Açıklama'))}<Textarea bind:value={block.text} rows={3} maxlength={600} /></label>
        <ImageField bind:value={block.image} label={t('Arka plan görseli')} />
        {#if block.image}<label class="grid gap-1.5">{@render label(t('Karartma: %{n}', { n: block.overlay }))}<input type="range" min={0} max={90} step={5} bind:value={block.overlay} class="accent-[var(--primary)]" /></label>{/if}
        <div class="grid gap-1.5">
          {@render label(t('Yükseklik'))}
          <div class="flex rounded-lg bg-muted p-1">
            {#each [['sm', t('Kısa')], ['md', t('Orta')], ['lg', t('Uzun')], ['screen', t('Tam ekran')]] as [v, l] (v)}<button type="button" class={seg(block.height === v)} onclick={() => ((block as { height: string }).height = v)}>{l}</button>{/each}
          </div>
        </div>
        <label class="flex items-center justify-between text-sm">{t('Logoyu göster')} <Switch bind:checked={block.showLogo} /></label>
        <ButtonsField bind:value={block.buttons} />
      {:else if block.type === 'navbar'}
        <label class="grid gap-1.5">{@render label(t('Marka yazısı'))}<Input bind:value={block.brand} maxlength={60} placeholder={t('Boşsa logo / forum adı')} /></label>
        <label class="flex items-center justify-between text-sm">{t('Logoyu göster')} <Switch bind:checked={block.showLogo} /></label>
        <div class="grid gap-2">
          {@render label(t('Bağlantılar'))}
          {#each block.links as l, i (i)}
            <div class="flex gap-1.5">
              <Input bind:value={l.label} placeholder={t('Ad')} class="h-8 w-28 text-xs" maxlength={40} />
              <Input bind:value={l.url} placeholder="/forum" class="h-8 font-mono text-xs" />
              <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" onclick={() => block.type === 'navbar' && (block.links = block.links.filter((_, k) => k !== i))} aria-label={t('Sil')}><TrashIcon class="size-4" /></button>
            </div>
          {/each}
          {#if block.links.length < 8}<button type="button" class="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-dashed text-xs font-semibold hover:bg-accent" onclick={() => block.type === 'navbar' && (block.links = [...block.links, { label: t('Bağlantı'), url: '/' }])}><PlusIcon class="size-3.5" />{t('Bağlantı ekle')}</button>{/if}
        </div>
        <ButtonsField bind:value={block.buttons} />
        <label class="flex items-center justify-between text-sm">{t('Giriş / kayıt ve üye menüsü')} <Switch bind:checked={block.showAuth} /></label>
        <label class="flex items-center justify-between text-sm">{t('Kaydırınca üstte sabit kalsın')} <Switch bind:checked={block.sticky} /></label>
        <label class="flex items-center justify-between gap-3 text-sm"><span class="grid"><span>{t('Kapağın üzerinde şeffaf')}</span><span class="text-xs text-muted-foreground">{t('Altındaki kapak bloğunun üstüne biner.')}</span></span><Switch bind:checked={block.transparent} /></label>
      {:else if block.type === 'footer'}
        <label class="grid gap-1.5">{@render label(t('Açıklama'))}<Textarea bind:value={block.text} rows={3} maxlength={400} placeholder={t('Kısa tanıtım yazısı')} /></label>
        <label class="flex items-center justify-between text-sm">{t('Logoyu göster')} <Switch bind:checked={block.showLogo} /></label>
        <label class="flex items-center justify-between text-sm">{t('Sosyal medya ikonları')} <Switch bind:checked={block.showSocial} /></label>
        <p class="-mt-2 text-[11px] text-muted-foreground">{t('Bağlantılar Yönetim → Görünüm → Alt bilgi bölümünden gelir.')}</p>
        {#each block.columns as c, ci (ci)}
          <div class="grid gap-1.5 rounded-lg border bg-muted/20 p-2">
            <div class="flex gap-1.5">
              <Input bind:value={c.title} placeholder={t('Sütun başlığı')} class="h-8 text-sm font-semibold" maxlength={40} />
              <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" onclick={() => block.type === 'footer' && (block.columns = block.columns.filter((_, k) => k !== ci))} aria-label={t('Sütunu sil')}><TrashIcon class="size-4" /></button>
            </div>
            {#each c.links as l, i (i)}
              <div class="flex gap-1.5">
                <Input bind:value={l.label} placeholder={t('Ad')} class="h-8 w-24 text-xs" maxlength={40} />
                <Input bind:value={l.url} placeholder="/wiki" class="h-8 font-mono text-xs" />
                <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" onclick={() => (c.links = c.links.filter((_, k) => k !== i))} aria-label={t('Sil')}><TrashIcon class="size-3.5" /></button>
              </div>
            {/each}
            {#if c.links.length < 8}<button type="button" class="h-7 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => (c.links = [...c.links, { label: t('Bağlantı'), url: '/' }])}>{t('+ Bağlantı')}</button>{/if}
          </div>
        {/each}
        {#if block.columns.length < 4}<button type="button" class="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-dashed text-xs font-semibold hover:bg-accent" onclick={() => block.type === 'footer' && (block.columns = [...block.columns, { title: t('Başlık'), links: [] }])}><PlusIcon class="size-3.5" />{t('Sütun ekle')}</button>{/if}
      {:else if block.type === 'split'}
        <label class="grid gap-1.5">{@render label(t('Üst etiket'))}<Input bind:value={block.eyebrow} maxlength={60} /></label>
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        <div class="grid gap-1.5">{@render label(t('Metin'))}<Editor bind:value={block.body} minHeight={180} maxLength={20000} mentions={false} uploadUrl="/api/admin/pages/images" placeholder={t('Metni yazın…')} /></div>
        <ImageField bind:value={block.image} />
        <div class="grid gap-1.5">
          {@render label(t('Görsel tarafı'))}
          <div class="flex rounded-lg bg-muted p-1">{#each [['left', t('Solda')], ['right', t('Sağda')]] as [v, l] (v)}<button type="button" class={seg(block.imageSide === v)} onclick={() => ((block as { imageSide: string }).imageSide = v)}>{l}</button>{/each}</div>
        </div>
        <ButtonsField bind:value={block.buttons} />
      {:else if block.type === 'testimonials'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        {#each block.items as it, i (i)}
          <div class="grid gap-1.5 rounded-lg border bg-muted/20 p-2">
            <Textarea bind:value={it.quote} rows={2} placeholder={t('Yorum')} maxlength={600} class="text-sm" />
            <div class="flex gap-1.5">
              <Input bind:value={it.name} placeholder={t('Ad')} class="h-8 text-xs" maxlength={60} />
              <Input bind:value={it.role} placeholder={t('Unvan')} class="h-8 text-xs" maxlength={60} />
              <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" onclick={() => block.type === 'testimonials' && (block.items = block.items.filter((_, k) => k !== i))} aria-label={t('Sil')}><TrashIcon class="size-4" /></button>
            </div>
            <ImageField bind:value={it.avatar} label={t('Fotoğraf (isteğe bağlı)')} />
          </div>
        {/each}
        {#if block.items.length < 12}<button type="button" class="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-dashed text-xs font-semibold hover:bg-accent" onclick={() => block.type === 'testimonials' && (block.items = [...block.items, { quote: '', name: '', role: '', avatar: '' }])}><PlusIcon class="size-3.5" />{t('Yorum ekle')}</button>{/if}
      {:else if block.type === 'pricing'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        <label class="grid gap-1.5">{@render label(t('Alt başlık'))}<Textarea bind:value={block.subtitle} rows={2} maxlength={400} /></label>
        {#each block.plans as pl, i (i)}
          <div class="grid gap-1.5 rounded-lg border bg-muted/20 p-2">
            <div class="flex gap-1.5">
              <Input bind:value={pl.name} placeholder={t('Paket adı')} class="h-8 text-sm font-semibold" maxlength={60} />
              <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" onclick={() => block.type === 'pricing' && (block.plans = block.plans.filter((_, k) => k !== i))} aria-label={t('Sil')}><TrashIcon class="size-4" /></button>
            </div>
            <div class="flex gap-1.5">
              <Input bind:value={pl.price} placeholder={t('₺99')} class="h-8 text-xs" maxlength={30} />
              <Input bind:value={pl.period} placeholder={t('/ay')} class="h-8 text-xs" maxlength={30} />
            </div>
            <Input bind:value={pl.description} placeholder={t('Kısa açıklama')} class="h-8 text-xs" maxlength={300} />
            <Textarea
              value={pl.features.join('\n')}
              oninput={(e) => (pl.features = (e.currentTarget as HTMLTextAreaElement).value.split('\n').slice(0, 15))}
              rows={3}
              placeholder={t('Her satıra bir özellik')}
              class="text-xs"
            />
            <div class="flex gap-1.5">
              <Input bind:value={pl.buttonLabel} placeholder={t('Düğme')} class="h-8 w-28 text-xs" maxlength={40} />
              <Input bind:value={pl.buttonUrl} placeholder={t('Bağlantı')} class="h-8 font-mono text-xs" />
            </div>
            <div class="flex items-center gap-2">
              <Input bind:value={pl.badge} placeholder={t('Etiket (ör. En popüler)')} class="h-8 text-xs" maxlength={30} />
              <label class="flex shrink-0 items-center gap-1.5 text-xs">{t('Öne çıkar')} <Switch bind:checked={pl.highlighted} class="scale-75" /></label>
            </div>
          </div>
        {/each}
        {#if block.plans.length < 4}<button type="button" class="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-dashed text-xs font-semibold hover:bg-accent" onclick={() => block.type === 'pricing' && (block.plans = [...block.plans, { name: t('Yeni paket'), price: '', period: '', description: '', features: [], buttonLabel: '', buttonUrl: '', highlighted: false, badge: '' }])}><PlusIcon class="size-3.5" />{t('Paket ekle')}</button>{/if}
      {:else if block.type === 'timeline'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        {#each block.items as it, i (i)}
          <div class="grid gap-1.5 rounded-lg border bg-muted/20 p-2">
            <div class="flex gap-1.5">
              <Input bind:value={it.date} placeholder={t('Tarih')} class="h-8 w-32 text-xs" maxlength={40} />
              <Input bind:value={it.title} placeholder={t('Başlık')} class="h-8 text-xs" maxlength={120} />
              <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" onclick={() => block.type === 'timeline' && (block.items = block.items.filter((_, k) => k !== i))} aria-label={t('Sil')}><TrashIcon class="size-4" /></button>
            </div>
            <Textarea bind:value={it.text} rows={2} placeholder={t('Açıklama')} maxlength={600} class="text-sm" />
          </div>
        {/each}
        <button type="button" class="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-dashed text-xs font-semibold hover:bg-accent" onclick={() => block.type === 'timeline' && (block.items = [{ date: '', title: '', text: '' }, ...block.items])}><PlusIcon class="size-3.5" />{t('Başa madde ekle')}</button>
      {:else if block.type === 'social'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        <label class="grid gap-1.5">{@render label(t('Metin'))}<Textarea bind:value={block.text} rows={2} maxlength={400} /></label>
        {#each block.links as l, i (i)}
          <div class="flex gap-1.5">
            <select bind:value={l.platform} class="h-8 w-28 rounded-md border bg-background px-1.5 text-xs">
              {#each SOCIALS as sp (sp)}<option value={sp}>{sp}</option>{/each}
            </select>
            <Input bind:value={l.url} placeholder="https://…" class="h-8 font-mono text-xs" />
            <Input bind:value={l.label} placeholder={t('Yazı')} class="h-8 w-24 text-xs" maxlength={40} />
            <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" onclick={() => block.type === 'social' && (block.links = block.links.filter((_, k) => k !== i))} aria-label={t('Sil')}><TrashIcon class="size-4" /></button>
          </div>
        {/each}
        {#if block.links.length < 10}<button type="button" class="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-dashed text-xs font-semibold hover:bg-accent" onclick={() => block.type === 'social' && (block.links = [...block.links, { platform: 'discord', url: 'https://', label: '' }])}><PlusIcon class="size-3.5" />{t('Bağlantı ekle')}</button>{/if}
      {:else if block.type === 'logos'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        <label class="flex items-center justify-between text-sm">{t('Gri tonlu (üzerine gelince renkli)')} <Switch bind:checked={block.grayscale} /></label>
        {#each block.items as lg, i (i)}
          <div class="grid gap-1.5 rounded-lg border bg-muted/20 p-2">
            <ImageField bind:value={lg.image} label={t('{n}. logo', { n: i + 1 })} />
            <div class="flex gap-1.5">
              <Input bind:value={lg.name} placeholder={t('Ad')} class="h-8 text-xs" maxlength={60} />
              <Input bind:value={lg.url} placeholder={t('Bağlantı')} class="h-8 font-mono text-xs" />
              <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" onclick={() => block.type === 'logos' && (block.items = block.items.filter((_, k) => k !== i))} aria-label={t('Sil')}><TrashIcon class="size-4" /></button>
            </div>
          </div>
        {/each}
        {#if block.items.length < 24}<button type="button" class="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-dashed text-xs font-semibold hover:bg-accent" onclick={() => block.type === 'logos' && (block.items = [...block.items, { image: '', name: '', url: '' }])}><PlusIcon class="size-3.5" />{t('Logo ekle')}</button>{/if}
      {:else if block.type === 'text'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        <div class="grid gap-1.5">{@render label(t('Metin'))}<Editor bind:value={block.body} compact={false} minHeight={220} maxLength={50000} mentions={false} uploadUrl="/api/admin/pages/images" placeholder={t('Metni yazın…')} /></div>
      {:else if block.type === 'features'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        <label class="grid gap-1.5">{@render label(t('Alt başlık'))}<Textarea bind:value={block.subtitle} rows={2} maxlength={400} /></label>
        <div class="grid gap-1.5">
          {@render label(t('Sütun'))}
          <div class="flex rounded-lg bg-muted p-1">{#each [2, 3, 4] as c (c)}<button type="button" class={seg(block.columns === c)} onclick={() => ((block as { columns: number }).columns = c)}>{c}</button>{/each}</div>
        </div>
        {#each block.items as it, i (i)}
          <div class="grid gap-2 rounded-lg border bg-muted/20 p-2.5">
            <div class="flex items-center gap-2">
              <IconPicker bind:name={it.icon} withColor={false} />
              <Input bind:value={it.title} placeholder={t('Başlık')} class="h-8 text-sm" maxlength={80} />
              <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30" disabled={i === 0} onclick={() => block.type === 'features' && (block.items = move(block.items, i))} aria-label={t('Yukarı')}><ArrowUpIcon class="size-4" /></button>
              <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" onclick={() => block.type === 'features' && (block.items = block.items.filter((_, k) => k !== i))} aria-label={t('Sil')}><TrashIcon class="size-4" /></button>
            </div>
            <Textarea bind:value={it.text} rows={2} placeholder={t('Kısa açıklama')} maxlength={400} class="text-sm" />
            <Input bind:value={it.url} placeholder={t('Bağlantı (isteğe bağlı)')} class="h-8 font-mono text-xs" />
          </div>
        {/each}
        {#if block.items.length < 12}<button type="button" class="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-dashed text-xs font-semibold hover:bg-accent" onclick={() => block.type === 'features' && (block.items = [...block.items, { icon: 'star', title: t('Yeni özellik'), text: '', url: '' }])}><PlusIcon class="size-3.5" />{t('Kart ekle')}</button>{/if}
      {:else if block.type === 'image'}
        <ImageField bind:value={block.url} />
        <label class="grid gap-1.5">{@render label(t('Alternatif metin'))}<Input bind:value={block.alt} maxlength={200} /></label>
        <label class="grid gap-1.5">{@render label(t('Açıklama'))}<Input bind:value={block.caption} maxlength={200} /></label>
        <label class="grid gap-1.5">{@render label(t('Bağlantı'))}<Input bind:value={block.link} placeholder="https://…" class="font-mono text-xs" /></label>
        <label class="flex items-center justify-between text-sm">{t('Yuvarlak köşeler')} <Switch bind:checked={block.rounded} /></label>
      {:else if block.type === 'gallery'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        <div class="grid gap-1.5">
          {@render label(t('Sütun'))}
          <div class="flex rounded-lg bg-muted p-1">{#each [2, 3, 4, 5] as c (c)}<button type="button" class={seg(block.columns === c)} onclick={() => ((block as { columns: number }).columns = c)}>{c}</button>{/each}</div>
        </div>
        <div class="grid gap-1.5">
          {@render label(t('Düzen'))}
          <div class="flex rounded-lg bg-muted p-1">{#each [['grid', t('Izgara')], ['masonry', t('Döşeme')], ['carousel', t('Kaydırmalı')]] as [v, l] (v)}<button type="button" class={seg(block.layout === v)} onclick={() => ((block as { layout: string }).layout = v)}>{l}</button>{/each}</div>
        </div>
        {#if block.layout === 'carousel'}<label class="flex items-center justify-between text-sm">{t('Otomatik geçiş')} <Switch bind:checked={block.autoplay} /></label>{/if}
        <label class="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs font-semibold hover:bg-accent">
          <PlusIcon class="size-3.5" />{t('Birden çok görsel yükle')}
          <input type="file" accept="image/*" multiple class="hidden" onchange={(e) => uploadMany(e)} />
        </label>
        {#each block.images as g, i (i)}
          <div class="grid gap-1.5 rounded-lg border bg-muted/20 p-2">
            <ImageField bind:value={g.url} label={t('{n}. görsel', { n: i + 1 })} />
            <div class="flex gap-1.5">
              <Input bind:value={g.caption} placeholder={t('Açıklama')} class="h-8 text-xs" maxlength={160} />
              <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" onclick={() => block.type === 'gallery' && (block.images = block.images.filter((_, k) => k !== i))} aria-label={t('Sil')}><TrashIcon class="size-4" /></button>
            </div>
          </div>
        {/each}
        {#if block.images.length < 30}<button type="button" class="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-dashed text-xs font-semibold hover:bg-accent" onclick={() => block.type === 'gallery' && (block.images = [...block.images, { url: '', caption: '' }])}><PlusIcon class="size-3.5" />{t('Görsel ekle')}</button>{/if}
      {:else if block.type === 'video'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        <label class="grid gap-1.5">{@render label(t('Bağlantı'))}<Input bind:value={block.url} placeholder="https://youtube.com/watch?v=…" class="font-mono text-xs" /></label>
        <p class="text-xs text-muted-foreground">{t('YouTube, Twitch, Kick, Spotify, SoundCloud, X, Instagram, TikTok ve daha fazlası.')}</p>
      {:else if block.type === 'stats'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        <div class="grid gap-2">
          {@render label(t('Gösterilenler'))}
          {#each [['members', t('Üye sayısı')], ['topics', t('Konu sayısı')], ['posts', t('Mesaj sayısı')], ['online', t('Çevrimiçi')]] as [k, l] (k)}
            {@const on = block.show.includes(k as never)}
            <label class="flex items-center justify-between text-sm">{l}<Switch checked={on} onCheckedChange={(v) => block.type === 'stats' && (block.show = v ? [...block.show, k as never] : block.show.length > 1 ? block.show.filter((x) => x !== k) : block.show)} /></label>
          {/each}
        </div>
      {:else if block.type === 'latest'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        <label class="grid gap-1.5">{@render label(t('Konu sayısı: {n}', { n: block.limit }))}<input type="range" min={3} max={12} bind:value={block.limit} class="accent-[var(--primary)]" /></label>
      {:else if block.type === 'boards'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        <p class="text-xs text-muted-foreground">{t('Ziyaretçinin görebildiği kategori ve bölümler otomatik listelenir.')}</p>
      {:else if block.type === 'server'}
        <label class="grid gap-1.5">{@render label(t('Sunucu adı'))}<Input bind:value={block.name} maxlength={120} /></label>
        <label class="grid gap-1.5">{@render label(t('Tanıtım'))}<Textarea bind:value={block.description} rows={3} maxlength={600} /></label>
        <label class="grid gap-1.5">{@render label(t('Adres (kopyalanır)'))}<Input bind:value={block.address} maxlength={120} placeholder="play.sunucu.com:30120" class="font-mono text-xs" /></label>
        <label class="grid gap-1.5">{@render label(t('Bağlan bağlantısı'))}<Input bind:value={block.connectUrl} placeholder={t('fivem://connect/… ya da steam://connect/…')} class="font-mono text-xs" /></label>
        <label class="grid gap-1.5"
          >{@render label(t('Durum'))}
          <select bind:value={block.status} class="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="online">{t('Çevrimiçi')}</option>
            <option value="maintenance">{t('Bakımda')}</option>
            <option value="soon">{t('Yakında')}</option>
            <option value="none">{t('Gösterme')}</option>
          </select>
        </label>
        <label class="grid gap-1.5">{@render label(t('Oyuncu bilgisi'))}<Input bind:value={block.players} maxlength={40} placeholder={t('ör. 128 slot')} /></label>
        <label class="grid gap-1.5"
          >{@render label(t('Etiketler (virgülle)'))}<Input
            value={block.tags.join(', ')}
            onchange={(e) => block.type === 'server' && (block.tags = (e.currentTarget as HTMLInputElement).value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8))}
            placeholder={t('Roleplay, Türkçe, 18+')}
          /></label
        >
        <ImageField bind:value={block.image} label={t('Kapak görseli')} />
      {:else if block.type === 'team'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} placeholder={t('Boşsa grup adı')} /></label>
        <label class="grid gap-1.5"
          >{@render label(t('Grup'))}
          <select bind:value={block.groupId} class="h-9 rounded-md border bg-background px-2 text-sm">
            <option value={null}>{t('Seçin…')}</option>
            {#each groups as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
          </select>
        </label>
        <label class="grid gap-1.5">{@render label(t('En fazla: {n} kişi', { n: block.limit }))}<input type="range" min={1} max={48} bind:value={block.limit} class="accent-[var(--primary)]" /></label>
      {:else if block.type === 'cta'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        <label class="grid gap-1.5">{@render label(t('Metin'))}<Textarea bind:value={block.text} rows={3} maxlength={600} /></label>
        <ButtonsField bind:value={block.buttons} />
      {:else if block.type === 'faq'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        {#each block.items as it, i (i)}
          <div class="grid gap-1.5 rounded-lg border bg-muted/20 p-2">
            <div class="flex gap-1.5">
              <Input bind:value={it.q} placeholder={t('Soru')} class="h-8 text-sm font-semibold" maxlength={200} />
              <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" onclick={() => block.type === 'faq' && (block.items = block.items.filter((_, k) => k !== i))} aria-label={t('Sil')}><TrashIcon class="size-4" /></button>
            </div>
            <Textarea bind:value={it.a} rows={3} placeholder={t('Cevap (BBCode kullanılabilir)')} class="text-sm" maxlength={4000} />
          </div>
        {/each}
        <button type="button" class="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-dashed text-xs font-semibold hover:bg-accent" onclick={() => block.type === 'faq' && (block.items = [...block.items, { q: '', a: '' }])}><PlusIcon class="size-3.5" />{t('Soru ekle')}</button>
      {:else if block.type === 'countdown'}
        <label class="grid gap-1.5">{@render label(t('Başlık'))}<Input bind:value={block.title} maxlength={160} /></label>
        <label class="grid gap-1.5">{@render label(t('Metin'))}<Textarea bind:value={block.text} rows={2} maxlength={400} /></label>
        <label class="grid gap-1.5"
          >{@render label(t('Hedef tarih'))}<input
            type="datetime-local"
            value={toLocal(block.target)}
            onchange={(e) => block.type === 'countdown' && (block.target = new Date((e.currentTarget as HTMLInputElement).value).getTime() || 0)}
            class="h-9 rounded-md border bg-background px-2 text-sm"
          /></label
        >
        <label class="grid gap-1.5">{@render label(t('Süre dolunca'))}<Input bind:value={block.doneText} maxlength={160} /></label>
      {:else if block.type === 'html'}
        {#if canCode}
          <CodeEditor bind:value={block.html} minHeight={320} maxLength={100000} placeholder="<div class='kutu'>…</div>" />
          <p class="text-xs text-muted-foreground">{t('{v} gibi değişkenler ve window.forum kullanılabilir.', { v: '{{viewer.username}}' })}</p>
        {:else}
          <p class="rounded-md bg-muted px-3 py-2 text-xs">{t('Bu bloğu düzenlemek için "Özel kod" yetkisi gerekir.')}</p>
        {/if}
      {:else if block.type === 'spacer'}
        <div class="grid gap-1.5">
          {@render label(t('Boşluk'))}
          <div class="flex rounded-lg bg-muted p-1">{#each [['sm', t('Az')], ['md', t('Orta')], ['lg', t('Çok')]] as [v, l] (v)}<button type="button" class={seg(block.size === v)} onclick={() => ((block as { size: string }).size = v)}>{l}</button>{/each}</div>
        </div>
        <label class="flex items-center justify-between text-sm">{t('Ayırıcı çizgi')} <Switch bind:checked={block.line} /></label>
      {/if}
    </div>
  {:else}
    <div class="grid gap-4">
      <div class="grid gap-1.5">
        {@render label(t('Arka plan'))}
        <div class="grid grid-cols-3 gap-1.5">
          {#each BGS as bg (bg.v)}
            <button type="button" onclick={() => (block.background = bg.v)} class={cn('grid gap-1 rounded-md border p-1.5 text-[11px] font-semibold transition-colors hover:bg-accent', block.background === bg.v && 'border-primary bg-primary-soft')}>
              <span class="h-5 rounded-sm border" style="background:{bg.css}"></span>{t(bg.l)}
            </button>
          {/each}
        </div>
      </div>
      {#if block.background === 'image' && block.type !== 'hero'}<ImageField bind:value={block.bgImage} label={t('Arka plan görseli')} />{/if}
      <div class="grid gap-1.5">
        {@render label(t('Genişlik'))}
        <div class="flex rounded-lg bg-muted p-1">
          {#each [['narrow', t('Dar')], ['contained', t('Normal')], ['full', t('Tam ekran')]] as [v, l] (v)}<button type="button" class={seg(block.width === v)} onclick={() => ((block as { width: string }).width = v)}>{l}</button>{/each}
        </div>
      </div>
      <div class="grid gap-1.5">
        {@render label(t('İç boşluk'))}
        <div class="flex rounded-lg bg-muted p-1">
          {#each [['none', t('Yok')], ['sm', t('Az')], ['md', t('Orta')], ['lg', t('Çok')]] as [v, l] (v)}<button type="button" class={seg(block.spacing === v)} onclick={() => ((block as { spacing: string }).spacing = v)}>{l}</button>{/each}
        </div>
      </div>
      <div class="grid gap-1.5">
        {@render label(t('Hizalama'))}
        <div class="flex rounded-lg bg-muted p-1">
          {#each [['left', t('Sola')], ['center', t('Ortaya')]] as [v, l] (v)}<button type="button" class={seg(block.align === v)} onclick={() => ((block as { align: string }).align = v)}>{l}</button>{/each}
        </div>
      </div>
      <div class="grid gap-1.5">
        {@render label(t('Kimler görsün'))}
        <div class="flex rounded-lg bg-muted p-1">
          {#each [['all', t('Herkes')], ['members', t('Üyeler')], ['guests', t('Misafirler')]] as [v, l] (v)}<button type="button" class={seg(block.visibility === v)} onclick={() => ((block as { visibility: string }).visibility = v)}>{l}</button>{/each}
        </div>
      </div>
      <div class="grid gap-1.5">
        {@render label(t('Beliriş animasyonu'))}
        <div class="flex rounded-lg bg-muted p-1">
          {#each [['none', t('Yok')], ['fade', t('Solma')], ['up', t('Yukarı')], ['zoom', t('Yakınlaş')]] as [v, l] (v)}<button type="button" class={seg(block.animation === v)} onclick={() => ((block as { animation: string }).animation = v)}>{l}</button>{/each}
        </div>
      </div>
      <label class="grid gap-1.5">{@render label(t('Bağlantı çapası'))}<Input bind:value={block.anchor} placeholder={t('ör. sunucu → /#sunucu')} class="font-mono text-xs" maxlength={40} /></label>
      <p class="text-[11px] text-muted-foreground">{t(BUILDER_BLOCKS[block.type].description)}</p>
    </div>
  {/if}
</div>
