<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import { DEFAULT_MAINTENANCE_PAGE, type MaintenancePage } from '@forum/shared';
  import PageHeaderIcon from 'phosphor-svelte/lib/TrafficCone';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import DesktopIcon from 'phosphor-svelte/lib/Desktop';
  import PhoneIcon from 'phosphor-svelte/lib/DeviceMobile';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { Textarea } from '$lib/components/ui/textarea';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SaveBar from '$lib/components/admin/SaveBar.svelte';
  import ColorField from '$lib/components/admin/themes/ColorField.svelte';
  import OptionCards from '$lib/components/admin/themes/OptionCards.svelte';
  import ImageField from '$lib/components/builder/ImageField.svelte';
  import MaintenanceScreen from '$lib/components/MaintenanceScreen.svelte';
  import { api, errorMessage } from '$lib/api';
  import { can } from '$lib/viewer';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  const settings = $derived(page.data.viewer?.settings ?? {});
  const stored = () => {
    const s = page.data.viewer?.settings ?? {};
    return {
      enabled: s['general.maintenanceMode'] === true,
      message: String(s['general.maintenanceMessage'] ?? ''),
      page: structuredClone(($state.snapshot(s['general.maintenancePage']) as MaintenancePage | undefined) ?? DEFAULT_MAINTENANCE_PAGE),
    };
  };
  let form = $state(untrack(stored));
  let saved = $state(untrack(() => JSON.stringify(stored())));
  const dirty = $derived(JSON.stringify(form) !== saved);
  let saving = $state(false);
  let device = $state<'desktop' | 'phone'>('desktop');
  const canCode = $derived(!!page.data.viewer && (page.data.viewer.isAdmin || can(page.data.viewer, 'admin.customCode')));

  // Geri sayım alanı: yerel saat (datetime-local) ⇄ ms
  const toLocal = (ms: number | null) => {
    if (!ms) return '';
    const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
    return d.toISOString().slice(0, 16);
  };
  let endsAtText = $state(untrack(() => toLocal(form.page.endsAt)));
  $effect(() => {
    const ms = endsAtText ? new Date(endsAtText).getTime() : NaN;
    untrack(() => (form.page.endsAt = Number.isFinite(ms) ? ms : null));
  });

  async function save() {
    saving = true;
    try {
      await api.put('/api/admin/maintenance/page', { ...form.page, enabled: form.enabled, message: form.message });
      saved = JSON.stringify(form);
      toast.success(form.enabled ? t('Kaydedildi; site bakım modunda.') : t('Kaydedildi.'));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }
  function reset() {
    form = JSON.parse(saved);
    endsAtText = toLocal(form.page.endsAt);
  }
</script>

<svelte:head><title>{t('Bakım sayfası')}</title></svelte:head>

<PageHeader
  title={t('Bakım sayfası')}
  description={t('Bakım modundayken ziyaretçilerin gördüğü sayfayı tasarlayın: düzen, arka plan, geri sayım, düğmeler ve isterseniz kendi HTML/CSS kodunuz.')}
  icon={PageHeaderIcon}
>
  {#snippet actions()}
    <Button variant="outline" href="/admin/maintenance"><ArrowLeftIcon />{t('Bakım ve yedekler')}</Button>
  {/snippet}
</PageHeader>

<div class="grid items-start gap-5 xl:grid-cols-[26rem_minmax(0,1fr)]" data-part="maintenance-editor">
  <div class="grid gap-4">
    <Card.Root class={cn(form.enabled && 'border-warning/50')}>
      <Card.Content class="grid gap-3 pt-5">
        <label class="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold"
          >{form.enabled ? t('Site bakımda') : t('Site açık')}<Switch bind:checked={form.enabled} /></label
        >
        <p class="text-xs text-muted-foreground">{t('Açıkken site ziyaretçilere kapanır; yöneticiler siteyi normal görür.')}</p>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('İçerik')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-3">
        <label class="grid gap-1.5 text-sm"
          ><span class="font-medium">{t('Başlık')}</span>
          <Input bind:value={form.page.title} maxlength={120} placeholder={t('{name} bakımda', { name: String(settings['general.forumName'] ?? '') })} /></label
        >
        <label class="grid gap-1.5 text-sm"
          ><span class="font-medium">{t('Mesaj')}</span>
          <Textarea bind:value={form.message} rows={3} maxlength={1000} /></label
        >
        <div class="grid gap-1.5 text-sm">
          <span class="font-medium">{t('Simge')}</span>
          <OptionCards
            bind:value={form.page.icon}
            cols={3}
            options={[
              { value: 'wrench', label: t('Anahtar') },
              { value: 'hammer', label: t('Çekiç') },
              { value: 'clock', label: t('Saat') },
              { value: 'rocket', label: t('Roket') },
              { value: 'logo', label: t('Logo') },
              { value: 'none', label: t('Yok') },
            ]}
          />
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Düzen ve arka plan')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-3">
        <OptionCards
          bind:value={form.page.layout}
          options={[
            { value: 'centered', label: t('Ortalı'), hint: t('Arka plan üzerinde') },
            { value: 'card', label: t('Kart'), hint: t('İçerik bir kartta') },
            { value: 'split', label: t('Bölünmüş'), hint: t('Yanda görsel') },
          ]}
        />
        <div class="grid gap-1.5 text-sm">
          <span class="font-medium">{t('Arka plan')}</span>
          <OptionCards
            bind:value={form.page.background.kind}
            cols={4}
            options={[
              { value: 'theme', label: t('Tema') },
              { value: 'color', label: t('Renk') },
              { value: 'gradient', label: t('Geçiş') },
              { value: 'image', label: t('Görsel') },
            ]}
          />
        </div>
        {#if form.page.background.kind === 'color'}
          <ColorField label={t('Renk')} bind:value={form.page.background.color} fallback="#0f172a" clearable={false} />
        {:else if form.page.background.kind === 'gradient'}
          <div class="grid gap-3">
            <ColorField label={t('Başlangıç')} bind:value={form.page.background.from} fallback="#1e1b4b" clearable={false} />
            <ColorField label={t('Bitiş')} bind:value={form.page.background.to} fallback="#0f766e" clearable={false} />
          </div>
          <label class="grid gap-1.5 text-xs font-semibold text-muted-foreground"
            >{t('Açı: {n}°', { n: form.page.background.angle })}
            <input type="range" min="0" max="360" step="15" bind:value={form.page.background.angle} class="accent-primary" /></label
          >
        {:else if form.page.background.kind === 'image'}
          <ImageField bind:value={form.page.background.image} uploadUrl="/api/admin/home/images" />
          <label class="grid gap-1.5 text-xs font-semibold text-muted-foreground"
            >{t('Karartma: %{n}', { n: form.page.background.dim })}
            <input type="range" min="0" max="90" step="5" bind:value={form.page.background.dim} class="accent-primary" /></label
          >
        {/if}
        {#if form.page.layout === 'centered' && form.page.background.kind !== 'theme'}
          <div class="grid gap-1.5 text-sm">
            <span class="font-medium">{t('Yazı rengi')}</span>
            <OptionCards
              bind:value={form.page.text}
              options={[
                { value: 'auto', label: t('Otomatik') },
                { value: 'light', label: t('Açık') },
                { value: 'dark', label: t('Koyu') },
              ]}
            />
          </div>
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Geri sayım ve ilerleme')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-3">
        <label class="grid gap-1.5 text-sm"
          ><span class="font-medium">{t('Bitiş zamanı')}</span>
          <span class="flex gap-2"
            ><Input type="datetime-local" bind:value={endsAtText} class="flex-1" />{#if endsAtText}<Button variant="ghost" size="icon" onclick={() => (endsAtText = '')} aria-label={t('Kaldır')}><TrashIcon /></Button>{/if}</span
          >
          <span class="text-xs text-muted-foreground">{t('Süre dolunca ziyaretçinin sayfası kendiliğinden yenilenir.')}</span></label
        >
        <label class="flex items-center justify-between gap-3 text-sm font-medium"
          >{t('İlerleme çubuğu')}<Switch checked={form.page.progress !== null} onCheckedChange={(v) => (form.page.progress = v ? 50 : null)} /></label
        >
        {#if form.page.progress !== null}
          <label class="grid gap-1.5 text-xs font-semibold text-muted-foreground"
            >{t('%{n} tamamlandı', { n: form.page.progress })}
            <input type="range" min="0" max="100" step="5" bind:value={form.page.progress} class="accent-primary" /></label
          >
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Düğmeler ve bağlantılar')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-3">
        {#each form.page.buttons as b, i (i)}
          <div class="flex gap-2">
            <Input bind:value={b.label} placeholder={t('Yazı')} maxlength={40} class="w-32" />
            <Input bind:value={b.url} placeholder="https://discord.gg/…" class="flex-1" />
            <Button variant="ghost" size="icon" onclick={() => form.page.buttons.splice(i, 1)} aria-label={t('Kaldır')}><TrashIcon /></Button>
          </div>
        {/each}
        {#if form.page.buttons.length < 3}
          <Button variant="outline" size="sm" class="justify-self-start" onclick={() => form.page.buttons.push({ label: '', url: '' })}><PlusIcon />{t('Düğme ekle')}</Button>
        {/if}
        <label class="flex items-center justify-between gap-3 text-sm font-medium">{t('Sosyal medya simgeleri')}<Switch bind:checked={form.page.social} /></label>
        <label class="flex items-center justify-between gap-3 text-sm font-medium">{t('"Yönetici girişi" bağlantısı')}<Switch bind:checked={form.page.showLogin} /></label>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title class="text-base">{t('Özel kod')}</Card.Title>
        <Card.Description>{t('Mesajın altına HTML (betik dahil) ve sayfaya CSS ekleyin. Önizlemede gösterilmez; kaydedip gizli pencerede deneyin.')}</Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-3">
        {#if !canCode}<p class="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t('Bu alanlar için "Özel kod" yetkisi gerekli.')}</p>{/if}
        <label class="grid gap-1.5 text-sm"
          ><span class="font-medium">HTML</span>
          <Textarea bind:value={form.page.html} rows={5} class="font-mono text-xs" disabled={!canCode} placeholder="&lt;iframe src=&quot;https://discord.com/widget?id=…&quot; width=&quot;350&quot; height=&quot;400&quot;&gt;&lt;/iframe&gt;" /></label
        >
        <label class="grid gap-1.5 text-sm"
          ><span class="font-medium">CSS</span>
          <Textarea bind:value={form.page.css} rows={5} class="font-mono text-xs" disabled={!canCode} placeholder={'[data-part="maintenance-title"] { letter-spacing: -0.04em; }'} /></label
        >
      </Card.Content>
    </Card.Root>
  </div>

  <!-- Canlı önizleme -->
  <div class="grid gap-3 xl:sticky xl:top-20">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold">{t('Önizleme')}</span>
      <span class="flex-1"></span>
      <div class="flex rounded-lg bg-muted p-0.5">
        {#each [{ v: 'desktop', i: DesktopIcon, l: t('Masaüstü') }, { v: 'phone', i: PhoneIcon, l: t('Telefon') }] as d (d.v)}
          <button
            type="button"
            class={cn('rounded-md p-1.5', device === d.v ? 'bg-background shadow-sm' : 'text-muted-foreground')}
            onclick={() => (device = d.v as typeof device)}
            aria-label={d.l}><d.i class="size-4" /></button
          >
        {/each}
      </div>
    </div>
    <div class={cn('mx-auto h-[38rem] w-full overflow-auto rounded-2xl border bg-background shadow-card', device === 'phone' && 'max-w-[390px]')}>
      <MaintenanceScreen
        cfg={form.page}
        forumName={String(settings['general.forumName'] ?? '')}
        message={form.message}
        logoUrl={(settings['appearance.logoUrl'] as string | null) ?? null}
        social={(settings['appearance.socialLinks'] ?? []) as Array<{ platform: string; url: string }>}
        preview
      />
    </div>
  </div>
</div>

<SaveBar {dirty} {saving} onsave={save} onreset={reset} />
