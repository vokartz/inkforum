<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import GearIcon from 'phosphor-svelte/lib/GearSix';
  import UserPlusIcon from 'phosphor-svelte/lib/UserPlus';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheck';
  import EnvelopeIcon from 'phosphor-svelte/lib/Envelope';
  import UserCircleIcon from 'phosphor-svelte/lib/UserCircle';
  import ImageIcon from 'phosphor-svelte/lib/Image';
  import SignatureIcon from 'phosphor-svelte/lib/Signature';
  import WarningIcon from 'phosphor-svelte/lib/Warning';
  import TrophyIcon from 'phosphor-svelte/lib/Trophy';
  import ChatsIcon from 'phosphor-svelte/lib/ChatsCircle';
  import PaletteIcon from 'phosphor-svelte/lib/Palette';
  import CookieIcon from 'phosphor-svelte/lib/Cookie';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import GlobeIcon from 'phosphor-svelte/lib/GlobeHemisphereWest';
  import XIcon from 'phosphor-svelte/lib/X';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import SettingRow from '$lib/components/admin/SettingRow.svelte';
  import SaveBar from '$lib/components/admin/SaveBar.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { cn, type IconComponent } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import type { SettingDef } from './+page';

  let { data } = $props();

  const META: Record<string, { icon: IconComponent; description: string }> = {
    general: { icon: GearIcon, description: 'Forum adı, açıklaması ve bakım modu.' },
    registration: { icon: UserPlusIcon, description: 'Kimlerin, nasıl üye olabileceği; yaş sınırı ve kullanıcı adı kuralları.' },
    security: { icon: ShieldCheckIcon, description: 'Şifre kuralları, oturumlar, giriş denemesi sınırları ve iki adımlı doğrulama.' },
    email: { icon: EnvelopeIcon, description: 'Gönderen adı ve adresi, e-posta bildirimleri.' },
    profile: { icon: UserCircleIcon, description: 'Profil sayfası, kapak fotoğrafı ve hakkımda alanı.' },
    avatars: { icon: ImageIcon, description: 'Profil fotoğrafı boyutları ve yükleme sınırları.' },
    signatures: { icon: SignatureIcon, description: 'Mesaj altı imzaları ve sınırları.' },
    warnings: { icon: WarningIcon, description: 'Uyarı puanları, süreleri ve otomatik yaptırımlar.' },
    achievements: { icon: TrophyIcon, description: 'Başarı sistemi ve puanlar.' },
    forum: { icon: ChatsIcon, description: 'Konu ve mesaj kuralları, sayfalama, düzenleme süreleri, görseller.' },
    appearance: { icon: PaletteIcon, description: 'Renk, yazı tipi ve karşılama alanı. Görseller için Görünüm sayfasını kullanın.' },
    cookies: { icon: CookieIcon, description: 'Çerez bildirimi ve metni.' },
    messages: { icon: EnvelopeIcon, description: 'Özel mesajlar: açık/kapalı, alıcı ve uzunluk sınırları, sel koruması.' },
    seo: { icon: GlobeIcon, description: 'Arama motoru dizinleme, robots.txt, site haritası, doğrulama kodları ve paylaşım kartları (Discord, X, WhatsApp).' },
  };

  // ---------- Düzenlenen değerler ----------
  type Value = unknown;
  let values = $state<Record<string, Value>>({});
  const toLocal = (d: SettingDef): Value => (d.input === 'list' ? ((d.value as string[]) ?? []).join('\n') : d.value);
  function sync() {
    const next: Record<string, Value> = {};
    for (const d of data.settings?.definitions ?? []) next[d.key] = toLocal(d);
    values = next;
  }
  sync();
  $effect.pre(() => {
    void data.settings;
    untrack(sync);
  });

  function normalize(d: SettingDef, v: Value): unknown {
    if (d.input === 'number') return Number(v);
    if (d.input === 'list') return String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
    return v;
  }
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  const defs = $derived(data.settings?.definitions ?? []);
  const changed = $derived(defs.filter((d) => !same(normalize(d, values[d.key]), d.value)));
  const sections = $derived(Object.entries(data.settings?.sections ?? {}).filter(([k]) => defs.some((d) => d.section === k)));

  // ---------- Arama (tüm bölümlerde) ----------
  let query = $state('');
  const q = $derived(query.trim().toLocaleLowerCase('tr-TR'));
  const visible = $derived(
    q
      ? defs.filter((d) => `${d.label} ${d.description ?? ''} ${d.key}`.toLocaleLowerCase('tr-TR').includes(q))
      : defs.filter((d) => d.section === data.section),
  );
  const grouped = $derived(sections.map(([k, label]) => ({ key: k, label, items: visible.filter((d) => d.section === k) })).filter((g) => g.items.length));

  // ---------- Kaydet ----------
  let saving = $state(false);
  let errors = $state<Record<string, string>>({});
  let message = $state<string | null>(null);
  async function save() {
    const patch: Record<string, unknown> = {};
    for (const d of changed) patch[d.key] = normalize(d, values[d.key]);
    if (!Object.keys(patch).length) return;
    saving = true;
    errors = {};
    message = null;
    try {
      await api.put('/api/admin/settings', patch);
      toast.success(t('{n} ayar kaydedildi.', { n: Object.keys(patch).length }));
      await invalidateAll();
    } catch (e) {
      if (e instanceof ApiError) {
        errors = e.fields;
        message = e.message;
      } else toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }

  const meta = (k: string) => META[k] ?? { icon: GearIcon, description: '' };
  const current = $derived(meta(data.section));
</script>

<PageHeader title={t('Ayarlar')} description={t('Forumun genel davranışını yapılandırın. Değişiklikler Kaydet dediğinizde uygulanır.')} icon={GearIcon} />

{#if data.settings}
  <div class="grid gap-6 pb-24 lg:grid-cols-[15rem_minmax(0,1fr)]">
    <!-- Bölüm menüsü -->
    <aside class="lg:sticky lg:top-24 lg:self-start">
      <div class="relative mb-3">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input bind:value={query} placeholder={t('Ayarlarda ara…')} class="pr-8 pl-9" aria-label={t('Ayarlarda ara')} />
        {#if query}
          <button type="button" onclick={() => (query = '')} class="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={t('Temizle')}>
            <XIcon class="size-3.5" />
          </button>
        {/if}
      </div>
      <nav class="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:overflow-visible lg:px-0" aria-label={t('Ayar bölümleri')}>
        {#each sections as [key, label] (key)}
          {@const m = meta(key)}
          {@const n = changed.filter((d) => d.section === key).length}
          {@const on = !q && data.section === key}
          <a
            href="/admin/settings/{key}"
            class={cn(
              'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              on ? 'bg-primary-soft text-highlight' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <m.icon class="size-[18px]" weight={on ? 'fill' : 'regular'} />{t(label)}
            {#if n}<span class="ml-auto size-2 rounded-full bg-warning" title={t('{n} kaydedilmemiş değişiklik', { n })}></span>{/if}
          </a>
        {/each}
      </nav>
    </aside>

    <!-- Ayarlar -->
    <div class="grid min-w-0 content-start gap-6">
      <FormMessage message={message} />
      {#each grouped as g (g.key)}
        {@const m = meta(g.key)}
        <section class="overflow-hidden rounded-2xl border bg-card shadow-card animate-rise" data-part="settings-section">
          <header class="flex items-center gap-3 border-b bg-panel-header px-5 py-4">
            <span class="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><m.icon class="size-5" weight="duotone" /></span>
            <div class="min-w-0">
              <h2 class="font-bold">{t(g.label)}</h2>
              {#if !q && m.description}<p class="text-xs text-muted-foreground">{t(m.description)}</p>{/if}
            </div>
          </header>
          {#each g.items as d (d.key)}
            {@const modified = !same(normalize(d, values[d.key]), d.default)}
            <SettingRow
              label={t(d.label)}
              description={d.description && t(d.description)}
              for={d.key}
              error={errors[d.key]}
              inline={d.input === 'boolean'}
              {modified}
              onreset={() => (values[d.key] = toLocal({ ...d, value: d.default }))}
            >
              {#if d.input === 'boolean'}
                <Switch id={d.key} bind:checked={values[d.key] as boolean} />
              {:else if d.input === 'textarea'}
                <Textarea id={d.key} bind:value={values[d.key] as string} rows={3} />
              {:else if d.input === 'list'}
                <Textarea id={d.key} bind:value={values[d.key] as string} rows={5} class="font-mono text-xs" placeholder={t('Her satıra bir değer')} />
              {:else if d.input === 'select' && d.options}
                <NativeSelect id={d.key} bind:value={values[d.key] as string} options={d.options.map((o) => ({ ...o, label: t(o.label) }))} />
              {:else if d.input === 'number'}
                <Input id={d.key} type="number" bind:value={values[d.key] as number} class="max-w-44" />
              {:else}
                <Input id={d.key} bind:value={values[d.key] as string} />
              {/if}
            </SettingRow>
          {/each}
        </section>
      {:else}
        <div class="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{t('“{query}” ile eşleşen ayar yok.', { query })}</div>
      {/each}
      {#if !q && current.description && data.section === 'appearance'}
        <p class="text-sm text-muted-foreground">{t('Logo, banner, arka planlar, menü ve alt bilgi için')} <a href="/admin/appearance" class="font-semibold text-link hover:underline">{t('Görünüm')}</a> {t('sayfasına gidin.')}</p>
      {/if}
    </div>
  </div>

  <SaveBar dirty={changed.length > 0} {saving} count={changed.length} onsave={save} onreset={sync} />
{/if}
