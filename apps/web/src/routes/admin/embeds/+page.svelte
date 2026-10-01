<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/YoutubeLogo';
  import { invalidate } from '$app/navigation';
  import { fly } from 'svelte/transition';
  import { toast } from 'svelte-sonner';
  import { customProviderIssue, type CustomEmbedProvider, type EmbedKind } from '@forum/shared';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import Trash2Icon from 'phosphor-svelte/lib/Trash';
  import FlaskConicalIcon from 'phosphor-svelte/lib/Flask';
  import SaveIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import PuzzleIcon from 'phosphor-svelte/lib/PuzzlePiece';
  import * as Card from '$lib/components/ui/card';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { Badge } from '$lib/components/ui/badge';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const e = $derived(data.embeds);

  const KIND: Record<EmbedKind, string> = { video: 'Video', audio: 'Müzik', post: 'Gönderi', code: 'Kod', map: 'Harita', card: 'Kart' };

  let enabled = $state(true);
  let autoEmbed = $state(true);
  let clickToLoad = $state(false);
  let disabled = $state<string[]>([]);
  let custom = $state<CustomEmbedProvider[]>([]);
  let original = $state('');

  const snapshot = () => JSON.stringify({ enabled, autoEmbed, clickToLoad, disabled: [...disabled].sort(), custom });
  function syncState1() {
    if (!e) return;
    enabled = e.enabled;
    autoEmbed = e.autoEmbed;
    clickToLoad = e.clickToLoad;
    disabled = [...e.disabledProviders];
    custom = e.custom.map((c) => ({ ...c }));
    original = snapshot();
  }
  syncState1();
  $effect.pre(syncState1);
  const dirty = $derived(!!e && snapshot() !== original);

  function toggleProvider(key: string, on: boolean) {
    disabled = on ? disabled.filter((k) => k !== key) : [...disabled, key];
  }

  let saving = $state(false);
  async function save() {
    saving = true;
    try {
      await api.put('/api/admin/embeds', { enabled, autoEmbed, clickToLoad, disabledProviders: disabled, custom });
      toast.success(t('Kaydedildi. Mesajlar arka planda yeni ayarlarla yeniden işleniyor.'));
      await invalidate('app:admin-embeds');
    } catch (err) {
      const fields = err instanceof ApiError ? Object.values(err.fields) : [];
      toast.error(fields[0] ?? errorMessage(err));
    } finally {
      saving = false;
    }
  }

  // ---------- Test ----------
  let testUrl = $state('');
  let testing = $state(false);
  let testResult = $state<{ match: { name: string; provider: string } | null; html: string } | null>(null);
  async function runTest(url = testUrl) {
    if (!url.trim()) return;
    testUrl = url;
    testing = true;
    try {
      testResult = await api.post('/api/admin/embeds/test', { url, disabledProviders: disabled, custom, clickToLoad: false });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      testing = false;
    }
  }

  // ---------- Özel sağlayıcı ----------
  let dlgOpen = $state(false);
  let editIndex = $state<number | null>(null);
  let draft = $state<CustomEmbedProvider>({ key: '', name: '', pattern: '', template: '', ratio: '16/9', height: null, maxWidth: 720, enabled: true });
  let sizeMode = $state<'ratio' | 'height'>('ratio');
  const draftIssue = $derived(draft.name && draft.pattern && draft.template ? customProviderIssue(draft) : null);

  function openCustom(i: number | null) {
    editIndex = i;
    draft = i === null ? { key: '', name: '', pattern: '', template: '', ratio: '16/9', height: null, maxWidth: 720, enabled: true } : { ...custom[i]! };
    sizeMode = draft.ratio ? 'ratio' : 'height';
    dlgOpen = true;
  }

  function slug(s: string) {
    return (
      s
        .toLocaleLowerCase('tr-TR')
        .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] ?? c)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'saglayici'
    );
  }

  function applyCustom(ev: SubmitEvent) {
    ev.preventDefault();
    const item: CustomEmbedProvider = {
      ...draft,
      key: draft.key || slug(draft.name),
      ratio: sizeMode === 'ratio' ? draft.ratio || '16/9' : null,
      height: sizeMode === 'height' ? Number(draft.height) || 400 : null,
      maxWidth: Number(draft.maxWidth) || 720,
    };
    if (customProviderIssue(item)) return;
    if (editIndex === null) custom = [...custom, item];
    else custom = custom.map((c, i) => (i === editIndex ? item : c));
    dlgOpen = false;
  }
</script>

<PageHeader icon={PageHeaderIcon}
  title={t('Gömülü içerik')}
  description={t('Mesajlarda paylaşılan YouTube, Spotify, X, Instagram, TikTok… bağlantıları oynatıcıya ya da gönderi kartına dönüşür. Kendi sağlayıcılarınızı da ekleyebilirsiniz.')}
/>

{#if e}
  <div class="grid gap-6">
    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Genel')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-4">
        <label class="flex items-start gap-3 text-sm">
          <Switch bind:checked={enabled} class="mt-0.5" />
          <span>{t('Gömülü içerik açık')}<span class="block text-xs text-muted-foreground">{t('Kapalıyken bağlantılar tıklanabilir link olarak kalır.')}</span></span>
        </label>
        <label class="flex items-start gap-3 text-sm">
          <Switch bind:checked={autoEmbed} disabled={!enabled} class="mt-0.5" />
          <span>{t('Tek satırdaki bağlantıları otomatik göm')}<span class="block text-xs text-muted-foreground">{t('Üye bağlantıyı ayrı bir satıra yapıştırdığında, [media] etiketi gerekmeden gömülür.')}</span></span>
        </label>
        <label class="flex items-start gap-3 text-sm">
          <Switch bind:checked={clickToLoad} disabled={!enabled} class="mt-0.5" />
          <span>{t('Tıklayınca yükle (gizlilik modu)')}<span class="block text-xs text-muted-foreground">{t('Üçüncü taraf içerik ziyaretçi tıklayana kadar yüklenmez; sayfa daha hızlı açılır, çerez izlenmez.')}</span></span>
        </label>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title class="flex items-center gap-2 text-base"><FlaskConicalIcon class="size-4" />{t('Bağlantı dene')}</Card.Title>
        <Card.Description>{t('Bir bağlantının kaydetmeden önce nasıl görüneceğini kontrol edin (henüz kaydedilmemiş ayarlarla).')}</Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-3">
        <form
          class="flex gap-2"
          onsubmit={(ev) => {
            ev.preventDefault();
            void runTest();
          }}
        >
          <Input bind:value={testUrl} placeholder="https://open.spotify.com/track/…" />
          <Button type="submit" disabled={testing}>{#if testing}<LoaderIcon class="animate-spin" />{/if}{t('Dene')}</Button>
        </form>
        {#if testResult}
          <div class="rounded-xl border p-3" in:fly={{ y: 6, duration: 200 }}>
            {#if testResult.match}
              <p class="mb-2 text-sm"><Badge variant="secondary">{testResult.match.name}</Badge> {t('sağlayıcısıyla eşleşti.')}</p>
              <div class="prose-forum">{@html testResult.html}</div>
            {:else}
              <p class="text-sm text-muted-foreground">{t('Bu bağlantı hiçbir sağlayıcıyla eşleşmedi; mesajda normal bağlantı olarak görünür.')}</p>
            {/if}
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    <section>
      <h2 class="mb-3 text-lg font-semibold">{t('Hazır sağlayıcılar')}</h2>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {#each e.providers as p (p.key)}
          {@const on = !disabled.includes(p.key)}
          <div class={cn('flex items-start gap-3 rounded-xl border bg-card p-3 transition-opacity', !on && 'opacity-55')}>
            <span class="mt-0.5 size-9 shrink-0 rounded-lg" style="background:{p.color};box-shadow:inset 0 0 0 1px rgb(255 255 255 / 15%)"></span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium">{p.name}</span>
                <Badge variant="outline" class="text-[10px]">{t(KIND[p.kind])}</Badge>
              </div>
              <button type="button" class="block max-w-full truncate text-left text-xs text-muted-foreground hover:text-primary" title={t('Dene')} onclick={() => runTest(p.examples[0])}>
                {p.examples[0]}
              </button>
            </div>
            <Switch checked={on} onCheckedChange={(v) => toggleProvider(p.key, v)} disabled={!enabled} aria-label={t('{name} açık', { name: p.name })} />
          </div>
        {/each}
      </div>
    </section>

    <section>
      <div class="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 class="flex items-center gap-2 text-lg font-semibold"><PuzzleIcon class="size-5" />{t('Özel sağlayıcılar')}</h2>
          <p class="text-sm text-muted-foreground">{t('Listede olmayan bir platform için bağlantı kalıbı ve gömme adresi tanımlayın.')}</p>
        </div>
        <Button variant="outline" onclick={() => openCustom(null)}><PlusIcon />{t('Sağlayıcı ekle')}</Button>
      </div>
      <div class="overflow-hidden rounded-xl border bg-card">
        {#each custom as c, i (c.key + i)}
          <div class="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
            <div class="min-w-0 flex-1">
              <p class="font-medium">{c.name} <span class="font-mono text-xs text-muted-foreground">{c.key}</span></p>
              <p class="truncate font-mono text-xs text-muted-foreground">{c.pattern} → {c.template}</p>
            </div>
            <Switch checked={c.enabled !== false} onCheckedChange={(v) => (custom[i]!.enabled = v)} aria-label={t('Açık')} />
            <Button variant="ghost" size="icon-sm" onclick={() => openCustom(i)} title={t('Düzenle')}><PencilIcon /></Button>
            <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => (custom = custom.filter((_, k) => k !== i))} title={t('Sil')}><Trash2Icon /></Button>
          </div>
        {:else}
          <p class="px-4 py-6 text-center text-sm text-muted-foreground">{t('Henüz özel sağlayıcı yok.')}</p>
        {/each}
      </div>
    </section>
  </div>

  {#if dirty}
    <div transition:fly={{ y: 24, duration: 200 }} class="sticky bottom-4 z-20 mt-6 flex items-center gap-3 rounded-xl border bg-popover px-4 py-2.5 shadow-lg">
      <span class="text-sm">{t('Kaydedilmemiş değişiklikler var.')}</span>
      <Button variant="ghost" size="sm" class="ml-auto" onclick={syncState1}>{t('Vazgeç')}</Button>
      <Button size="sm" onclick={save} disabled={saving}>{#if saving}<LoaderIcon class="animate-spin" />{:else}<SaveIcon />{/if}{t('Kaydet')}</Button>
    </div>
  {/if}

  <Dialog.Root bind:open={dlgOpen}>
    <Dialog.Content class="sm:max-w-lg">
      <form class="grid gap-4" onsubmit={applyCustom}>
        <Dialog.Header>
          <Dialog.Title>{editIndex === null ? t('Özel sağlayıcı ekle') : t('Özel sağlayıcıyı düzenle')}</Dialog.Title>
          <Dialog.Description>
            {t('Kalıptaki yakalanan grupları şablonda')} <code>$1</code>, <code>$2</code>… {t('ile, tam adresi')} <code>{'{url}'}</code> {t('ile kullanın.')}
          </Dialog.Description>
        </Dialog.Header>
        <Field label={t('Ad')} for="c-name"><Input id="c-name" bind:value={draft.name} maxlength={60} placeholder={t('Örn. Medal.tv')} required /></Field>
        <Field label={t('Bağlantı kalıbı (düzenli ifade)')} for="c-pattern">
          <Input id="c-pattern" bind:value={draft.pattern} class="font-mono text-xs" placeholder="^https://medal\.tv/.*/clips/(\w+)" required />
        </Field>
        <Field label={t('Gömme adresi şablonu')} for="c-tpl">
          <Input id="c-tpl" bind:value={draft.template} class="font-mono text-xs" placeholder="https://medal.tv/clip/$1?autoplay=0" required />
        </Field>
        <div class="grid gap-3 sm:grid-cols-3">
          <Field label={t('Boyut')}>
            <div class="flex gap-1 rounded-lg bg-muted p-1 text-xs">
              <button type="button" class={cn('flex-1 rounded-md py-1', sizeMode === 'ratio' && 'bg-background shadow-sm')} onclick={() => (sizeMode = 'ratio')}>{t('Oran')}</button>
              <button type="button" class={cn('flex-1 rounded-md py-1', sizeMode === 'height' && 'bg-background shadow-sm')} onclick={() => (sizeMode = 'height')}>{t('Yükseklik')}</button>
            </div>
          </Field>
          {#if sizeMode === 'ratio'}
            <Field label={t('Oran')} for="c-ratio"><Input id="c-ratio" bind:value={draft.ratio} placeholder="16/9" /></Field>
          {:else}
            <Field label={t('Yükseklik (px)')} for="c-h"><Input id="c-h" type="number" min={80} max={1200} bind:value={draft.height} /></Field>
          {/if}
          <Field label={t('En fazla genişlik')} for="c-w"><Input id="c-w" type="number" min={200} max={1200} bind:value={draft.maxWidth} /></Field>
        </div>
        {#if draftIssue}<p class="text-sm text-destructive">{t(draftIssue)}</p>{/if}
        <Dialog.Footer>
          <Button type="button" variant="ghost" onclick={() => (dlgOpen = false)}>{t('Vazgeç')}</Button>
          <Button type="submit" disabled={!draft.name || !draft.pattern || !draft.template || !!draftIssue}>{t('Tamam')}</Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>
{/if}
