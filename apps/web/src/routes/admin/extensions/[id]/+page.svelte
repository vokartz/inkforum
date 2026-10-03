<script lang="ts">
  import { EXTENSION_SLOT_INFO, type ExtensionSettingField } from '@forum/shared';
  import { goto, invalidate, invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import ArrowClockwiseIcon from 'phosphor-svelte/lib/ArrowClockwise';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import WarningIcon from 'phosphor-svelte/lib/WarningCircle';
  import FloppyIcon from 'phosphor-svelte/lib/FloppyDisk';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRight';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import * as Tabs from '$lib/components/ui/tabs';
  import Field from '$lib/components/Field.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import ExtensionStatusBadge from '$lib/components/admin/extensions/ExtensionStatusBadge.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { guardUnsaved } from '$lib/leave-guard';
  import { formatDate } from '$lib/format';
  import { can } from '$lib/viewer';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const d = $derived(data.detail);
  const e = $derived(d?.extension);
  const canManage = $derived(can(data.viewer, 'admin.extensions'));

  let values = $state<Record<string, unknown>>({});
  let saved = $state('');
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);
  $effect.pre(() => {
    if (d) {
      values = structuredClone(d.values);
      saved = JSON.stringify(d.values);
    }
  });
  const dirty = $derived(JSON.stringify(values) !== saved);
  guardUnsaved(() => dirty);
  const sections = $derived.by(() => {
    const out = new Map<string, ExtensionSettingField[]>();
    for (const f of d?.fields ?? []) {
      const key = f.section ?? '';
      out.set(key, [...(out.get(key) ?? []), f]);
    }
    return [...out.entries()];
  });

  async function save() {
    if (!e) return;
    saving = true;
    errors = {};
    try {
      await api.put(`/api/admin/extensions/${e.id}/settings`, values);
      toast.success(t('Ayarlar kaydedildi.'));
      saved = JSON.stringify(values);
      await invalidate('app:admin-extension');
    } catch (err) {
      if (err instanceof ApiError) errors = err.fields;
      toast.error(errorMessage(err));
    } finally {
      saving = false;
    }
  }

  let busy = $state(false);
  async function run(fn: () => Promise<unknown>, ok: string) {
    busy = true;
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      busy = false;
      await invalidate('app:admin-extension');
      await invalidateAll();
    }
  }
  const toggle = (on: boolean) => run(() => api.put(`/api/admin/extensions/${e!.id}/enabled`, { enabled: on }), on ? t('Eklenti etkinleştirildi.') : t('Eklenti kapatıldı.'));
  const reload = () => run(() => api.post(`/api/admin/extensions/${e!.id}/reload`), t('Eklenti yeniden yüklendi.'));

  async function uninstall() {
    if (!e) return;
    const ok = await confirmAction({
      title: t('"{name}" kaldırılsın mı?', { name: e.name }),
      description: t('Eklentinin dosyaları silinir. Eklentinin verilerini (tabloları, ayarları, yetkileri) de silmek istiyor musun? "Verileri koru" seçersen eklentiyi daha sonra yeniden kurduğunda kaldığı yerden devam eder.'),
      confirmLabel: t('Kaldır'),
      destructive: true,
    });
    if (!ok) return;
    const wipe = await confirmAction({
      title: t('Verileri de sil?'),
      description: t('Eklentinin oluşturduğu tablolar ve kayıtlar kalıcı olarak silinir. Bu işlem geri alınamaz.'),
      confirmLabel: t('Verileri de sil'),
      cancelLabel: t('Verileri koru'),
      destructive: true,
    });
    busy = true;
    try {
      await api.post(`/api/admin/extensions/${e.id}/uninstall`, { deleteData: wipe });
      toast.success(t('"{name}" kaldırıldı.', { name: e.name }));
      await invalidateAll();
      await goto('/admin/extensions');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      busy = false;
    }
  }

  function toggleGroup(key: string, id: number, on: boolean) {
    const list = Array.isArray(values[key]) ? (values[key] as number[]) : [];
    values[key] = on ? [...new Set([...list, id])] : list.filter((x) => x !== id);
  }
  const groupOptions = $derived(data.groups.filter((g) => g.systemKey !== 'guest'));

  let tab = $state('settings');
  $effect.pre(() => {
    if (d && !d.fields.length && tab === 'settings') tab = 'info';
  });
</script>

<svelte:head><title>{e?.name ?? t('Eklenti')} · {t('Eklentiler')}</title></svelte:head>

{#if d && e}
  <a href="/admin/extensions" class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon class="size-4" />{t('Eklentiler')}</a>

  <header class="mb-6 flex flex-wrap items-start gap-4 animate-rise">
    <span class={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl border', e.status === 'active' ? 'border-primary/25 bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
      <NodeIcon nodes={e.iconNode} size={30} />
    </span>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="text-[1.65rem] leading-tight font-extrabold tracking-tight">{e.name}</h1>
        <span class="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">v{e.version}</span>
        <ExtensionStatusBadge status={e.status} />
      </div>
      {#if e.description}<p class="mt-1 max-w-3xl text-sm text-muted-foreground">{e.description}</p>{/if}
      <p class="mt-1 text-xs text-muted-foreground">
        {#if e.author}{t('Geliştirici: {name}', { name: e.author })} · {/if}{t('Kimlik: {id}', { id: e.id })}
        {#if e.installedAt} · {t('Kuruldu: {date}', { date: formatDate(e.installedAt) })}{/if}
        {#if e.homepage} · <a href={e.homepage} target="_blank" rel="noopener" class="text-link hover:underline">{t('Web sitesi')}</a>{/if}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if e.status === 'active' && e.publicHref}<Button variant="ghost" href={e.publicHref} target="_blank"><ArrowSquareOutIcon />{t('Aç')}</Button>{/if}
      {#if canManage}
        {#if e.status === 'active'}<Button variant="outline" disabled={busy} onclick={reload} title={t('Sunucu kodunu yeniden yükler (geliştirirken)')}><ArrowClockwiseIcon />{t('Yeniden yükle')}</Button>{/if}
        <label class="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold">
          <Switch checked={e.enabled && e.status !== 'error'} disabled={busy || e.status === 'incompatible'} onCheckedChange={toggle} />{e.enabled && e.status !== 'error' ? t('Etkin') : t('Kapalı')}
        </label>
        <Button variant="ghost" class="text-destructive hover:text-destructive" disabled={busy} onclick={uninstall}><TrashIcon />{t('Kaldır')}</Button>
      {/if}
    </div>
  </header>

  {#if e.error}
    <div class="mb-6 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
      <WarningIcon class="mt-0.5 size-5 shrink-0" />
      <div class="min-w-0"><p class="font-semibold">{t('Eklenti yüklenemedi')}</p><p class="mt-1 break-words">{e.error}</p></div>
    </div>
  {/if}

  {#if e.capabilities.adminPages.length}
    <div class="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {#each e.capabilities.adminPages as p (p.key)}
        <a href="/admin/extensions/{e.id}/{p.key}" class="flex items-center gap-3 rounded-xl border bg-card p-4 font-semibold transition-colors hover:border-ring/50">
          {p.title}<CaretRightIcon class="ml-auto size-4 text-muted-foreground" />
        </a>
      {/each}
    </div>
  {/if}

  <Tabs.Root bind:value={tab}>
    <Tabs.List>
      {#if d.fields.length}<Tabs.Trigger value="settings">{t('Ayarlar')}</Tabs.Trigger>{/if}
      <Tabs.Trigger value="info">{t('Bilgi')}</Tabs.Trigger>
      <Tabs.Trigger value="logs">{t('Kayıtlar')}{#if d.logs.some((l) => l.level === 'error')}<span class="ml-1.5 size-2 rounded-full bg-destructive"></span>{/if}</Tabs.Trigger>
    </Tabs.List>

    {#if d.fields.length}
      <Tabs.Content value="settings" class="mt-5">
        <form class="grid max-w-3xl gap-6" onsubmit={(ev) => (ev.preventDefault(), save())}>
          {#each sections as [title, fields] (title)}
            <section class="grid gap-5 rounded-2xl border bg-card p-5">
              {#if title}<h2 class="text-base font-bold">{title}</h2>{/if}
              {#each fields as f (f.key)}
                {#if f.type === 'boolean'}
                  <label class="flex items-start gap-3 text-sm">
                    <Switch checked={values[f.key] === true} onCheckedChange={(on) => (values[f.key] = on)} class="mt-0.5" />
                    <span>{f.label}{#if f.hint}<span class="block text-xs text-muted-foreground">{f.hint}</span>{/if}</span>
                  </label>
                {:else}
                  <Field label={f.label} hint={f.type === 'secret' && values[f.key] ? t('Kayıtlı. Değiştirmek için yeni değeri yazın; silmek için alanı boşaltın.') : (f.hint ?? null)} error={errors[f.key] ?? null} required={f.required}>
                    {#if f.type === 'textarea'}
                      <Textarea value={String(values[f.key] ?? '')} oninput={(ev) => (values[f.key] = ev.currentTarget.value)} rows={5} placeholder={f.placeholder} />
                    {:else if f.type === 'select'}
                      <NativeSelect bind:value={() => String(values[f.key] ?? ''), (v) => (values[f.key] = v)} options={(f.options ?? []).map((o) => ({ value: o.value, label: o.label }))} />
                    {:else if f.type === 'groups'}
                      <div class="flex flex-wrap gap-2">
                        {#each groupOptions as g (g.id)}
                          {@const on = Array.isArray(values[f.key]) && (values[f.key] as number[]).includes(g.id)}
                          <label class={cn('flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm', on && 'border-primary bg-primary-soft')}>
                            <input type="checkbox" checked={on} onchange={(ev) => toggleGroup(f.key, g.id, ev.currentTarget.checked)} class="accent-[var(--primary)]" />{g.name}
                          </label>
                        {/each}
                      </div>
                    {:else if f.type === 'color'}
                      <div class="flex items-center gap-2">
                        <input type="color" value={String(values[f.key] || '#7b61ff')} oninput={(ev) => (values[f.key] = ev.currentTarget.value)} class="h-9 w-12 cursor-pointer rounded border bg-transparent" />
                        <Input value={String(values[f.key] ?? '')} oninput={(ev) => (values[f.key] = ev.currentTarget.value)} class="w-32 font-mono" placeholder="#rrggbb" />
                      </div>
                    {:else}
                      <Input
                        type={f.type === 'number' ? 'number' : f.type === 'secret' ? 'password' : f.type === 'url' ? 'url' : 'text'}
                        value={values[f.key] === undefined || values[f.key] === null ? '' : String(values[f.key])}
                        oninput={(ev) => (values[f.key] = f.type === 'number' ? Number(ev.currentTarget.value) : ev.currentTarget.value)}
                        onfocus={(ev) => {
                          if (f.type === 'secret' && values[f.key] === '••••••••') ev.currentTarget.select();
                        }}
                        min={f.min}
                        max={f.max}
                        placeholder={f.placeholder}
                        autocomplete={f.type === 'secret' ? 'new-password' : 'off'}
                      />
                    {/if}
                  </Field>
                {/if}
              {/each}
            </section>
          {/each}
          <div class="sticky bottom-4 flex justify-end">
            <Button type="submit" disabled={!dirty || saving} class="shadow-lg"><FloppyIcon />{saving ? t('Kaydediliyor…') : t('Ayarları kaydet')}</Button>
          </div>
        </form>
      </Tabs.Content>
    {/if}

    <Tabs.Content value="info" class="mt-5">
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div class="min-w-0 rounded-2xl border bg-card p-5">
          {#if d.readmeHtml}<div class="prose-forum">{@html d.readmeHtml}</div>{:else}<p class="text-sm text-muted-foreground">{t('Bu eklentinin açıklama dosyası (README.md) yok.')}</p>{/if}
        </div>
        <aside class="grid content-start gap-3 rounded-2xl border bg-card p-5 text-sm">
          <h2 class="font-bold">{t('Eklentinin yaptıkları')}</h2>
          <dl class="grid gap-2">
            <div><dt class="text-xs text-muted-foreground">{t('Sunucu kodu')}</dt><dd>{e.capabilities.server ? t('Var') : t('Yok')}</dd></div>
            {#if e.capabilities.pages.length}<div><dt class="text-xs text-muted-foreground">{t('Sayfalar')}</dt><dd class="font-mono text-xs">{e.capabilities.pages.join(', ')}</dd></div>{/if}
            {#if e.capabilities.routes}<div><dt class="text-xs text-muted-foreground">{t('API uçları')}</dt><dd class="font-mono text-xs">/api/ext/{e.id}/… ({e.capabilities.routes})</dd></div>{/if}
            {#if e.capabilities.slots.length}<div><dt class="text-xs text-muted-foreground">{t('Yerler')}</dt><dd>{e.capabilities.slots.map((s) => t(EXTENSION_SLOT_INFO[s].label)).join(', ')}</dd></div>{/if}
            {#if e.capabilities.permissions.length}<div><dt class="text-xs text-muted-foreground">{t('Yetkiler')}</dt><dd>{e.capabilities.permissions.join(', ')}</dd></div>{/if}
            {#if e.capabilities.clientScripts || e.capabilities.clientStyles}<div><dt class="text-xs text-muted-foreground">{t('Tarayıcı dosyaları')}</dt><dd>{t('{s} betik, {c} stil (her sayfada)', { s: e.capabilities.clientScripts, c: e.capabilities.clientStyles })}</dd></div>{/if}
            {#if e.capabilities.csp.length}<div><dt class="text-xs text-muted-foreground">{t('İzin verilen dış adresler')}</dt><dd class="font-mono text-xs break-all">{e.capabilities.csp.join(' ')}</dd></div>{/if}
            {#if e.capabilities.events.length}<div><dt class="text-xs text-muted-foreground">{t('Dinlediği olaylar')}</dt><dd class="font-mono text-xs">{e.capabilities.events.join(', ')}</dd></div>{/if}
            {#if e.capabilities.jobs.length}<div><dt class="text-xs text-muted-foreground">{t('Görevler')}</dt><dd class="font-mono text-xs">{e.capabilities.jobs.join(', ')}</dd></div>{/if}
          </dl>
          {#if e.capabilities.permissions.length}<a href="/admin/permissions" class="text-xs font-semibold text-link hover:underline">{t('Yetkileri gruplara ver →')}</a>{/if}
        </aside>
      </div>
    </Tabs.Content>

    <Tabs.Content value="logs" class="mt-5">
      <div class="overflow-hidden rounded-2xl border bg-card">
        {#each d.logs as l, i (i)}
          <div class={cn('grid gap-1 border-b px-4 py-2.5 text-sm last:border-0 sm:grid-cols-[10rem_minmax(0,1fr)]', l.level === 'error' && 'bg-destructive/5')}>
            <span class="text-xs text-muted-foreground tabular-nums">{formatDate(l.at)}</span>
            <pre class={cn('font-mono text-xs break-words whitespace-pre-wrap', l.level === 'error' ? 'text-destructive' : l.level === 'warn' ? 'text-warning' : '')}>{l.message}</pre>
          </div>
        {:else}
          <p class="p-8 text-center text-sm text-muted-foreground">{t('Henüz kayıt yok. Eklentinin ctx.log ile yazdıkları ve hatalar burada görünür (forum yeniden başlayınca temizlenir).')}</p>
        {/each}
      </div>
    </Tabs.Content>
  </Tabs.Root>
{/if}
