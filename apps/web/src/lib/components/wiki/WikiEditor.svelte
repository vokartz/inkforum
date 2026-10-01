<script lang="ts">
  import type { WikiPageInput, WikiTreeNode } from '@forum/shared';
  import { untrack } from 'svelte';
  import { beforeNavigate, goto, invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import FloppyIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import Field from '$lib/components/Field.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import IconPicker from '$lib/components/IconPicker.svelte';

  interface Props {
    tree: WikiTreeNode[];
    /** Düzenlenen sayfa (yoksa yeni) */
    pageId?: number | null;
    initial: WikiPageInput;
    canManage: boolean;
    backHref: string;
    notice?: string | null;
  }
  let { tree, pageId = null, initial, canManage, backHref, notice = null }: Props = $props();

  let form = $state<WikiPageInput>(untrack(() => ({ ...initial })));
  const snapshot = untrack(() => JSON.stringify(initial));
  const dirty = $derived(JSON.stringify(form) !== snapshot);
  let slugTouched = $state(untrack(() => !!pageId));
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);
  let saved = false;

  const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  const slugify = (s: string) =>
    s
      .toLocaleLowerCase('tr-TR')
      .replace(/[çğıöşüâîû]/g, (c) => TR[c] ?? c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

  // Üst sayfa seçenekleri (kendisi ve alt sayfaları hariç)
  const options = $derived.by(() => {
    const out: Array<{ id: number; label: string; path: string }> = [];
    const walk = (nodes: WikiTreeNode[], depth: number) => {
      for (const n of nodes) {
        if (n.id === pageId) continue;
        out.push({ id: n.id, label: `${'— '.repeat(depth)}${n.title}`, path: n.path });
        walk(n.children, depth + 1);
      }
    };
    walk(tree, 0);
    return out;
  });
  const parentPath = $derived(options.find((o) => o.id === form.parentId)?.path ?? null);

  async function save() {
    saving = true;
    errors = {};
    try {
      const body = { ...form, icon: form.icon?.trim() || null, summary: form.summary?.trim() || null, note: form.note?.trim() || null };
      const res = pageId ? await api.put<{ id: number; path: string }>(`/api/wiki/pages/${pageId}`, body) : await api.post<{ id: number; path: string }>('/api/wiki/pages', body);
      saved = true;
      toast.success(pageId ? t('Sayfa kaydedildi.') : t('Sayfa oluşturuldu.'));
      await invalidate('app:wiki');
      await goto(`/wiki/${res.path}`);
    } catch (e) {
      if (e instanceof ApiError) {
        errors = e.fields;
        toast.error(Object.values(e.fields)[0] ?? e.message);
      } else toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }

  beforeNavigate((nav) => {
    if (dirty && !saved && !confirm(t('Kaydedilmemiş değişiklikler kaybolacak. Çıkılsın mı?'))) nav.cancel();
  });
  function onkeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!saving) void save();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="grid gap-5" data-part="wiki-editor">
  <div class="flex flex-wrap items-center gap-2">
    <Button variant="ghost" href={backHref}><ArrowLeftIcon />{t('Geri')}</Button>
    <h1 class="text-xl font-extrabold">{pageId ? t('Sayfayı düzenle') : t('Yeni wiki sayfası')}</h1>
    <Button class="ml-auto" onclick={save} disabled={saving || !form.title.trim() || !form.slug.trim()}>
      {#if saving}<LoaderIcon class="animate-spin" />{:else}<FloppyIcon />{/if}{pageId ? t('Kaydet') : t('Oluştur')}
    </Button>
  </div>
  {#if notice}<p class="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{notice}</p>{/if}

  <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
    <div class="grid min-w-0 content-start gap-4">
      <div class="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
        <Field label={t('İkon')} error={errors.icon}>
          <IconPicker bind:name={form.icon} withColor={false} searchUrl="/api/wiki/icons" />
        </Field>
        <Field label={t('Başlık')} error={errors.title}>
          <Input bind:value={form.title} oninput={() => !slugTouched && (form.slug = slugify(form.title))} maxlength={120} class="h-11 text-base font-semibold" placeholder={t('ör. Karakter oluşturma rehberi')} />
        </Field>
      </div>
      <Field label={t('Kısa açıklama')} hint={t('Listelerde ve arama sonuçlarında görünür.')}>
        <Textarea bind:value={form.summary} rows={2} maxlength={300} />
      </Field>
      <Field label={t('İçerik')} error={errors.body} hint={t('Başlık düğmesiyle (H) bölümler ekleyin; sayfanın yanında otomatik içindekiler oluşur.')}>
        <Editor bind:value={form.body} minHeight={480} maxLength={300000} mentions={false} uploadUrl="/api/wiki/images" placeholder={t('Sayfa içeriğini yazın…')} />
      </Field>
    </div>

    <aside class="grid content-start gap-4">
      <section class="grid gap-4 rounded-xl border bg-card p-4">
        <Field label={t('Üst sayfa')} error={errors.parentId} hint={pageId && !canManage ? t('Sayfayı taşımak için wiki yöneticisi olmalısınız.') : null}>
          <select bind:value={form.parentId} disabled={!!pageId && !canManage} class="h-9 rounded-md border bg-background px-2 text-sm">
            <option value={null}>{t('— Ana seviye —')}</option>
            {#each options as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
          </select>
        </Field>
        <Field label={t('Adres')} error={errors.slug}>
          <div class="flex items-center overflow-hidden rounded-md border bg-background focus-within:border-ring">
            <span class="max-w-40 truncate border-r bg-muted px-2 py-2 font-mono text-xs text-muted-foreground" title="/wiki/{parentPath ? `${parentPath}/` : ''}">/wiki/{parentPath ? `${parentPath}/` : ''}</span>
            <input bind:value={form.slug} oninput={() => (slugTouched = true)} maxlength={60} class="min-w-0 flex-1 bg-transparent px-2 py-2 font-mono text-sm outline-none" />
          </div>
        </Field>
        <label class="flex items-center justify-between gap-3 text-sm font-semibold">{t('Yayında')} <Switch bind:checked={form.isPublished} /></label>
        {#if canManage}
          <label class="flex items-center justify-between gap-3 text-sm">
            <span class="grid"><span class="font-semibold">{t('Kilitli')}</span><span class="text-xs text-muted-foreground">{t('Yalnızca wiki yöneticileri düzenleyebilir.')}</span></span>
            <Switch bind:checked={form.isLocked} />
          </label>
        {/if}
      </section>
      <section class="grid gap-2 rounded-xl border bg-card p-4">
        <Field label={t('Değişiklik notu')} hint={t('Sayfa geçmişinde görünür (isteğe bağlı).')}>
          <Input bind:value={form.note} maxlength={200} placeholder={t('ör. Yeni kurallar eklendi')} />
        </Field>
      </section>
      <p class={cn('text-center text-xs text-muted-foreground', !dirty && 'invisible')}>{t('Kaydedilmemiş değişiklikler var')} · Ctrl+S</p>
    </aside>
  </div>
</div>
