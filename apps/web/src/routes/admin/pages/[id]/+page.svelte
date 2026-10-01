<script lang="ts">
  import {
    PAGE_LAYOUT_INFO,
    PAGE_LAYOUTS,
    slugify,
    type AdminCustomPage,
    type CustomPageView,
    type PageFormat,
    type PageInput,
    type PageTestResult,
    type ResolvedBlock,
  } from '@forum/shared';
  import { tick, untrack } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import FloppyIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import PlayIcon from 'phosphor-svelte/lib/Play';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import BookIcon from 'phosphor-svelte/lib/BookOpenText';
  import SparkleIcon from 'phosphor-svelte/lib/Sparkle';
  import LockIcon from 'phosphor-svelte/lib/LockSimple';
  import WarningIcon from 'phosphor-svelte/lib/Warning';
  import * as Card from '$lib/components/ui/card';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { Textarea } from '$lib/components/ui/textarea';
  import Field from '$lib/components/Field.svelte';
  import CodeEditor from '$lib/components/CodeEditor.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import VisibilityField from '$lib/components/admin/VisibilityField.svelte';
  import OptionCards from '$lib/components/admin/themes/OptionCards.svelte';
  import BuilderPage from '$lib/components/builder/BuilderPage.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { DEFAULT_SERVER_CODE, PAGE_EXAMPLES, type PageExample } from '$lib/page-examples';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();

  type Secret = { name: string; value?: string; saved: boolean };
  type Form = Omit<PageInput, 'secrets'> & { secrets: Secret[] };
  const EMPTY: Form = {
    slug: '',
    title: '',
    format: 'html',
    body: '',
    layout: 'default',
    showTitle: true,
    metaDescription: null,
    visibility: 'all',
    groupIds: [],
    isPublished: false,
    route: null,
    css: '',
    js: '',
    sidebar: 'none',
    sidebarHtml: '',
    serverEnabled: false,
    serverCode: '',
    allowedHosts: [],
    secrets: [],
  };
  const pick = (p: AdminCustomPage): Form => {
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = p;
    return { ...rest, groupIds: [...rest.groupIds], allowedHosts: [...rest.allowedHosts], secrets: rest.secrets.map((x) => ({ name: x.name, saved: true })) };
  };
  let form = $state<Form>(untrack(() => (data.page ? pick(data.page) : structuredClone(EMPTY))));
  let snapshot = $state(untrack(() => JSON.stringify(form)));
  const dirty = $derived(JSON.stringify(form) !== snapshot);
  let slugTouched = $state(untrack(() => !!data.page));
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);
  let left = false;
  /** Kod alanları "Özel kod" yetkisi ister */
  const locked = $derived(!data.canCode);
  const url = $derived(form.route ? `/${form.route}` : `/pages/${form.slug || '…'}`);
  let hostsText = $state(untrack(() => form.allowedHosts.join('\n')));
  $effect(() => {
    const list = hostsText
      .split(/[\s,]+/)
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    untrack(() => (form.allowedHosts = list));
  });

  type Tab = 'general' | 'content' | 'css' | 'js' | 'sidebar' | 'server';
  let tab = $state<Tab>('general');
  const TABS = $derived<Array<{ v: Tab; l: string; code?: boolean; hidden?: boolean }>>([
    { v: 'general', l: t('Genel') },
    { v: 'content', l: form.format === 'html' ? 'HTML' : t('İçerik') },
    { v: 'css', l: 'CSS', code: true },
    { v: 'js', l: 'JavaScript', code: true },
    { v: 'sidebar', l: t('Kenar çubuğu'), code: true, hidden: form.layout === 'blank' },
    { v: 'server', l: t('Sunucu'), code: true },
  ]);

  // Biçim değişince önceki içerik saklanır
  const stash: Partial<Record<PageFormat, string>> = {};
  function setFormat(f: PageFormat) {
    if (f === form.format) return;
    stash[form.format] = form.body;
    form.format = f;
    form.body = stash[f] ?? '';
  }

  async function save(publish?: boolean) {
    if (!form.title.trim()) {
      tab = 'general';
      return toast.error(t('Sayfa başlığı gerekli.'));
    }
    if (!form.slug.trim()) form.slug = slugify(form.title) || `sayfa-${Date.now().toString(36)}`;
    if (publish !== undefined) form.isPublished = publish;
    saving = true;
    errors = {};
    try {
      const body = {
        ...form,
        metaDescription: form.metaDescription?.trim() || null,
        route: form.route?.trim() || null,
        // Kayıtlı gizli değerler: yeni değer yazılmadıysa yalnızca ad gönderilir (sunucuda korunur)
        secrets: form.secrets.filter((x) => x.name.trim()).map((x) => (x.value ? { name: x.name.trim(), value: x.value } : { name: x.name.trim() })),
      };
      const res = data.page ? await api.put<AdminCustomPage>(`/api/admin/pages/${data.page.id}`, body) : await api.post<AdminCustomPage>('/api/admin/pages', body);
      form = pick(res);
      snapshot = JSON.stringify(form);
      toast.success(data.page ? t('Kaydedildi.') : t('Sayfa oluşturuldu.'));
      if (!data.page) {
        left = true;
        await goto(`/admin/pages/${res.id}`, { replaceState: true, invalidateAll: true });
      }
    } catch (e) {
      if (e instanceof ApiError) {
        errors = e.fields;
        const first = Object.keys(e.fields)[0] ?? '';
        if (['title', 'slug', 'route', 'groupIds', 'metaDescription', 'format'].includes(first)) tab = 'general';
        else if (first.startsWith('secrets') || first.startsWith('allowedHosts') || first === 'serverCode') tab = 'server';
        toast.error(Object.values(e.fields)[0] ?? e.message);
      } else toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!data.page || !(await confirmAction({ title: t('Sayfa silinsin mi?'), description: t('{url} adresi artık açılmaz; sayfanın sunucu verileri de silinir.', { url }), confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/admin/pages/${data.page.id}`);
      left = true;
      toast.success(t('Sayfa silindi.'));
      await goto('/admin/pages');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  beforeNavigate((nav) => {
    if (dirty && !left && !saving && !confirm(t('Kaydedilmemiş değişiklikler kaybolacak. Çıkılsın mı?'))) nav.cancel();
  });
  function onkeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!saving) void save();
    }
  }

  // ---------- Örnekler ----------
  async function useExample(x: PageExample) {
    const replaces = [x.html && form.body.trim(), x.css && form.css.trim(), x.js && form.js.trim(), x.sidebar && form.sidebarHtml.trim(), x.server && form.serverCode.trim()].some(Boolean);
    if (replaces && !(await confirmAction({ title: t('Örnek eklensin mi?'), description: t('Örneğin içerdiği alanlar (HTML, CSS, JS, kenar çubuğu, sunucu kodu) şu anki içeriğin yerine geçer.'), confirmLabel: t('Ekle') }))) return;
    if (x.html) {
      form.format = 'html';
      form.body = x.html;
    }
    if (x.css) form.css = x.css;
    if (x.js) form.js = x.js;
    if (x.sidebar) {
      form.sidebarHtml = x.sidebar;
      if (form.sidebar === 'none') form.sidebar = 'right';
      if (form.layout === 'blank') form.layout = 'default';
    }
    if (x.server) {
      form.serverCode = x.server;
      form.serverEnabled = true;
    }
    if (x.hosts) hostsText = [...new Set([...form.allowedHosts, ...x.hosts])].join('\n');
    for (const name of x.secrets ?? []) if (!form.secrets.some((s) => s.name === name)) form.secrets.push({ name, value: '', saved: false });
    tab = x.server ? 'server' : x.sidebar && !x.html ? 'sidebar' : 'content';
    toast.success(t('"{title}" örneği eklendi. Adresleri ve anahtarları kendi sisteminize göre değiştirin.', { title: t(x.title) }));
  }

  // ---------- Sunucu kodu denemesi ----------
  let testMethod = $state<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>('GET');
  let testPath = $state('/');
  let testQuery = $state('');
  let testBody = $state('');
  let testAs = $state<'me' | 'guest'>('me');
  let testing = $state(false);
  let result = $state<PageTestResult | null>(null);
  async function runTest() {
    if (!data.page) return toast.error(t('Denemeden önce sayfayı bir kez kaydedin.'));
    testing = true;
    try {
      const query = Object.fromEntries(
        testQuery
          .split('\n')
          .map((l) => l.split('='))
          .filter(([k]) => k?.trim())
          .map(([k, ...v]) => [k!.trim(), v.join('=').trim()]),
      );
      result = await api.post<PageTestResult>(`/api/admin/pages/${data.page.id}/test`, { method: testMethod, path: testPath || '/', query, body: testBody, as: testAs, code: form.serverCode });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      testing = false;
    }
  }

  // ---------- Eski görsel düzenleyici sayfaları → HTML ----------
  let legacyBlocks = $state<ResolvedBlock[] | null>(null);
  let legacyHost = $state<HTMLElement | null>(null);
  let converting = $state(false);
  async function convertToHtml() {
    if (!data.page) return;
    converting = true;
    try {
      const view = await api.get<CustomPageView>(`/api/pages/${data.page.slug}`);
      legacyBlocks = view.blocks ?? [];
      await tick();
      await new Promise((r) => setTimeout(r, 400));
      const html = (legacyHost?.innerHTML ?? '').replace(/<!--[\s\S]*?-->/g, '').trim();
      let css = '';
      try {
        css = (JSON.parse(data.page.body) as { css?: string }).css ?? '';
      } catch {
        /* boş */
      }
      form.format = 'html';
      form.body = html;
      if (css && !form.css) form.css = css;
      tab = 'content';
      toast.success(t('Sayfa HTML koduna dönüştürüldü. Kontrol edip kaydedin.'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      converting = false;
      legacyBlocks = null;
    }
  }

  const JS_PLACEHOLDER = "const veri = forum.page.data;\nconsole.log('Merhaba', forum.viewer.displayName);";
  const SIDEBAR_PLACEHOLDER = '<forum-user></forum-user>\n<forum-recent limit="5"></forum-recent>';
  const pretty = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
</script>

<svelte:window {onkeydown} />
<svelte:head><title>{form.title || t('Yeni sayfa')} · {t('Özel sayfalar')}</title></svelte:head>

<div class="grid gap-5" data-part="page-editor">
  <!-- Üst çubuk -->
  <div class="flex flex-wrap items-center gap-3">
    <Button href="/admin/pages" variant="ghost" size="icon" aria-label={t('Geri')}><ArrowLeftIcon /></Button>
    <div class="min-w-0 flex-1">
      <h1 class="truncate text-xl font-bold tracking-tight">{form.title || t('Yeni sayfa')}</h1>
      <p class="font-mono text-xs text-muted-foreground">{url}</p>
    </div>
    <Button href="/admin/pages/docs" variant="ghost" target="_blank"><BookIcon />{t('Belgeler')}</Button>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}<Button {...props} variant="outline" disabled={locked}><SparkleIcon />{t('Örnekler')}</Button>{/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-80">
        {#each PAGE_EXAMPLES as x (x.key)}
          <DropdownMenu.Item onSelect={() => useExample(x)} class="grid items-start gap-0.5">
            <span class="font-semibold">{t(x.title)}</span>
            <span class="text-xs text-muted-foreground">{t(x.description)}</span>
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    {#if data.page}<Button href={url} target="_blank" variant="outline"><ArrowSquareOutIcon />{t('Görüntüle')}</Button>{/if}
    {#if !form.isPublished}<Button variant="outline" onclick={() => save(true)} disabled={saving}>{t('Yayımla')}</Button>{/if}
    <Button onclick={() => save()} disabled={saving || (!dirty && !!data.page)}>{#if saving}<LoaderIcon class="animate-spin" />{:else}<FloppyIcon />{/if}{t('Kaydet')}</Button>
  </div>

  {#if form.format === 'builder'}
    <div class="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      <WarningIcon class="size-5 shrink-0 text-warning" />
      <p class="min-w-0 flex-1">{t('Bu sayfa kaldırılan görsel düzenleyiciyle yapıldı. Görünmeye devam eder; içeriğini değiştirmek için HTML koduna dönüştürün.')}</p>
      <Button size="sm" onclick={convertToHtml} disabled={converting || locked}>{#if converting}<LoaderIcon class="animate-spin" />{/if}{t('HTML koduna dönüştür')}</Button>
    </div>
    {#if legacyBlocks}<div bind:this={legacyHost} class="pointer-events-none fixed -left-[9999px] w-[1200px]" aria-hidden="true"><BuilderPage blocks={legacyBlocks} standalone={form.layout === 'blank'} /></div>{/if}
  {/if}
  {#if locked}
    <p class="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"><LockIcon class="size-4" />{t('HTML, CSS, JavaScript ve sunucu kodu için "Özel kod" yetkisi gerekir; yalnızca BBCode içeriği ve sayfa ayarlarını değiştirebilirsin.')}</p>
  {/if}

  <!-- Sekmeler -->
  <div class="flex gap-5 overflow-x-auto border-b" role="tablist">
    {#each TABS.filter((x) => !x.hidden) as x (x.v)}
      <button
        type="button"
        role="tab"
        aria-selected={tab === x.v}
        class={cn('-mb-px shrink-0 border-b-2 py-2.5 text-sm font-semibold transition-colors', tab === x.v ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
        onclick={() => (tab = x.v)}
      >
        {x.l}
        {#if x.v === 'server' && form.serverEnabled}<span class="ml-1 inline-block size-1.5 -translate-y-0.5 rounded-full bg-success"></span>{/if}
      </button>
    {/each}
  </div>

  {#if tab === 'general'}
    <div class="grid items-start gap-5 lg:grid-cols-2">
      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Sayfa')}</Card.Title></Card.Header>
        <Card.Content class="grid gap-4">
          <Field label={t('Başlık')} for="pg-title" error={errors.title} required>
            <Input id="pg-title" bind:value={form.title} maxlength={120} oninput={() => !slugTouched && (form.slug = slugify(form.title))} />
          </Field>
          <Field label={t('Kısa ad')} for="pg-slug" error={errors.slug} hint={t('Sayfa her zaman /pages/{slug} adresinden de açılır.', { slug: form.slug || '…' })}>
            <Input id="pg-slug" bind:value={form.slug} maxlength={60} class="font-mono" oninput={() => (slugTouched = true)} />
          </Field>
          <Field label={t('Kök adres (isteğe bağlı)')} for="pg-route" error={errors.route} hint={t('Ör. "ucp" yazarsanız sayfa /ucp adresinde açılır; sunucu kodu varsa /ucp/… alt adresleri de bu sayfaya gelir.')}>
            <div class="flex items-center rounded-md border bg-background focus-within:border-ring">
              <span class="pl-3 font-mono text-sm text-muted-foreground">/</span>
              <input id="pg-route" bind:value={form.route} maxlength={80} placeholder="ucp" class="h-9 min-w-0 flex-1 bg-transparent px-1 font-mono text-sm outline-none" />
            </div>
          </Field>
          <Field label={t('Açıklama (arama motorları ve paylaşım kartı)')} for="pg-meta" error={errors.metaDescription}>
            <Textarea id="pg-meta" value={form.metaDescription ?? ''} oninput={(e) => (form.metaDescription = e.currentTarget.value)} rows={2} maxlength={300} />
          </Field>
          <label class="flex items-center justify-between gap-3 text-sm font-medium">{t('Yayında')}<Switch bind:checked={form.isPublished} /></label>
        </Card.Content>
      </Card.Root>

      <div class="grid gap-5">
        <Card.Root>
          <Card.Header><Card.Title class="text-base">{t('Düzen')}</Card.Title></Card.Header>
          <Card.Content class="grid gap-4">
            <OptionCards bind:value={form.layout} options={PAGE_LAYOUTS.map((l) => ({ value: l, label: t(PAGE_LAYOUT_INFO[l].label), hint: t(PAGE_LAYOUT_INFO[l].description) }))} />
            {#if form.layout !== 'blank'}
              <div class="grid gap-1.5 text-sm">
                <span class="font-medium">{t('Kenar çubuğu')}</span>
                <OptionCards
                  bind:value={form.sidebar}
                  options={[
                    { value: 'none', label: t('Yok') },
                    { value: 'left', label: t('Solda') },
                    { value: 'right', label: t('Sağda') },
                  ]}
                />
              </div>
              <label class="flex items-center justify-between gap-3 text-sm font-medium">{t('Başlığı göster')}<Switch bind:checked={form.showTitle} /></label>
            {/if}
            {#if form.format !== 'builder'}
              <div class="grid gap-1.5 text-sm">
                <span class="font-medium">{t('İçerik biçimi')}</span>
                <div class="grid grid-cols-2 gap-1.5" role="radiogroup">
                  {#each [{ v: 'html', l: 'HTML', h: t('Tam kontrol: HTML, bileşenler, f-* sınıfları') }, { v: 'bbcode', l: 'BBCode', h: t('Mesaj düzenleyicisiyle yazılan içerik') }] as o (o.v)}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={form.format === o.v}
                      disabled={o.v === 'html' && locked}
                      onclick={() => setFormat(o.v as PageFormat)}
                      class={cn('rounded-lg border px-2 py-2 text-left text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-50', form.format === o.v && 'border-primary bg-primary-soft')}
                      >{o.l}<span class="mt-0.5 block text-[11px] font-normal text-muted-foreground">{o.h}</span></button
                    >
                  {/each}
                </div>
              </div>
            {/if}
          </Card.Content>
        </Card.Root>
        <Card.Root>
          <Card.Header><Card.Title class="text-base">{t('Görünürlük')}</Card.Title></Card.Header>
          <Card.Content><VisibilityField bind:visibility={form.visibility} bind:groupIds={form.groupIds} groups={data.groups} error={errors.groupIds} /></Card.Content>
        </Card.Root>
        {#if data.page}
          <Button variant="outline" class="justify-self-start text-destructive" onclick={remove} disabled={locked && (form.format === 'html' || form.serverEnabled || !!form.js)}><TrashIcon />{t('Sayfayı sil')}</Button>
        {/if}
      </div>
    </div>
  {:else if tab === 'content'}
    {#if form.format === 'bbcode'}
      <Editor bind:value={form.body} minHeight={420} maxLength={500000} mentions={false} uploadUrl="/api/admin/pages/images" placeholder={t('Sayfa içeriğini yazın…')} />
    {:else}
      <div class="grid gap-2">
        <CodeEditor bind:value={form.body} language="HTML" minHeight={520} maxLength={500000} placeholder={'<section class="f-hero">\n  <h1 class="f-title">Merhaba {{viewer.displayName}}</h1>\n  <forum-stats></forum-stats>\n</section>'} />
        <p class="text-xs text-muted-foreground">
          {t('Şablon değişkenleri: {{viewer.displayName}}, {{forum.name}}, sunucu verisi için {{data.alan}}. Hazır bileşenler: <forum-user>, <forum-stats>, <forum-recent>, <forum-online>, <forum-countdown>… Tüm liste Belgeler sayfasında.')}
        </p>
      </div>
    {/if}
  {:else if tab === 'css'}
    <div class="grid gap-2">
      <CodeEditor bind:value={form.css} language="CSS" minHeight={520} maxLength={200000} placeholder={'.f-hero { background: linear-gradient(135deg, #1e1b4b, #0f766e); }'} />
      <p class="text-xs text-muted-foreground">{t('Yalnızca bu sayfada yüklenir. Sitenin renk değişkenleri (--primary, --card, --border…) ve f-* sınıfları kullanılabilir.')}</p>
    </div>
  {:else if tab === 'js'}
    <div class="grid gap-2">
      <CodeEditor bind:value={form.js} language="JavaScript" minHeight={520} maxLength={200000} placeholder={JS_PLACEHOLDER} />
      <p class="text-xs text-muted-foreground">{t('Sayfa içeriğinden sonra tarayıcıda çalışır. forum.viewer, forum.page.data, forum.api(), forum.token() kullanılabilir.')}</p>
    </div>
  {:else if tab === 'sidebar'}
    <div class="grid gap-2">
      {#if form.sidebar === 'none'}<p class="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t('Kenar çubuğu kapalı. Genel sekmesinden solda ya da sağda gösterin.')}</p>{/if}
      <CodeEditor bind:value={form.sidebarHtml} language="HTML" minHeight={420} maxLength={100000} placeholder={SIDEBAR_PLACEHOLDER} />
    </div>
  {:else if tab === 'server'}
    <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div class="grid gap-3">
        <label class="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold"
          >{t('Sunucu kodu açık')}<Switch bind:checked={form.serverEnabled} disabled={locked} /></label
        >
        <CodeEditor bind:value={form.serverCode} language="JavaScript (sunucu)" minHeight={480} maxLength={100000} placeholder={DEFAULT_SERVER_CODE} />
        {#if !form.serverCode.trim()}
          <Button variant="outline" size="sm" class="justify-self-start" onclick={() => (form.serverCode = DEFAULT_SERVER_CODE)}><PlusIcon />{t('Başlangıç şablonunu ekle')}</Button>
        {/if}
        <p class="text-xs text-muted-foreground">
          {t('Kod forum sunucusunda yalıtılmış bir ortamda çalışır: dosya sistemine ve sunucuya erişemez; istek başına 1 sn işlemci, 10 sn toplam süre ve 32 MB bellek sınırı vardır. Kullanılabilenler: req, json(), html(), text(), redirect(), notFound(), fetch(), kv, secrets, forum.token(), forum.user(), console.log().')}
        </p>
      </div>

      <div class="grid gap-4">
        <Card.Root>
          <Card.Header><Card.Title class="text-base">{t('İzinli alan adları')}</Card.Title><Card.Description>{t('fetch() yalnızca bu alan adlarına istek atabilir. Her satıra bir tane (joker: *.ornek.com).')}</Card.Description></Card.Header>
          <Card.Content><Textarea bind:value={hostsText} rows={3} class="font-mono text-xs" placeholder="api.ucp-sunucum.com" disabled={locked} /></Card.Content>
        </Card.Root>
        <Card.Root>
          <Card.Header><Card.Title class="text-base">{t('Gizli değerler')}</Card.Title><Card.Description>{t('API anahtarı gibi değerler sunucuda şifreli saklanır; kodda secrets.AD ile okunur, tarayıcıya hiç gönderilmez.')}</Card.Description></Card.Header>
          <Card.Content class="grid gap-2">
            {#each form.secrets as s, i (i)}
              <div class="flex gap-2">
                <Input bind:value={s.name} placeholder="UCP_API_KEY" class="w-36 font-mono text-xs uppercase" disabled={locked || s.saved} />
                <Input bind:value={s.value} type="password" placeholder={s.saved ? t('•••••• (kayıtlı; değiştirmek için yazın)') : t('Değer')} class="flex-1 font-mono text-xs" disabled={locked} autocomplete="off" />
                <Button variant="ghost" size="icon" onclick={() => form.secrets.splice(i, 1)} aria-label={t('Kaldır')} disabled={locked}><TrashIcon /></Button>
              </div>
            {/each}
            {#if errors.secrets}<p class="text-xs text-destructive">{errors.secrets}</p>{/if}
            <Button variant="outline" size="sm" class="justify-self-start" onclick={() => form.secrets.push({ name: '', value: '', saved: false })} disabled={locked}><PlusIcon />{t('Gizli değer ekle')}</Button>
          </Card.Content>
        </Card.Root>
        <Card.Root>
          <Card.Header>
            <Card.Title class="text-base">{t('Dene')}</Card.Title>
            <Card.Description>{t('Düzenleyicideki kodu (kaydetmeden) bir istekle çalıştırır; kv ve fetch gerçek çalışır.')}</Card.Description>
          </Card.Header>
          <Card.Content class="grid gap-3">
            <div class="flex gap-2">
              <select bind:value={testMethod} class="h-9 rounded-md border bg-background px-2 text-sm">
                {#each ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as m (m)}<option>{m}</option>{/each}
              </select>
              <Input bind:value={testPath} placeholder="/" class="flex-1 font-mono text-xs" />
            </div>
            <Textarea bind:value={testQuery} rows={2} class="font-mono text-xs" placeholder={t('Sorgu: her satıra ad=değer')} />
            {#if testMethod !== 'GET'}<Textarea bind:value={testBody} rows={3} class="font-mono text-xs" placeholder={'{ "mesaj": "merhaba" }'} />{/if}
            <div class="flex items-center gap-2">
              <select bind:value={testAs} class="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="me">{t('Ben olarak')}</option>
                <option value="guest">{t('Misafir olarak')}</option>
              </select>
              <Button class="ml-auto" size="sm" onclick={runTest} disabled={testing || locked || !form.serverCode.trim()}>{#if testing}<LoaderIcon class="animate-spin" />{:else}<PlayIcon weight="fill" />{/if}{t('Çalıştır')}</Button>
            </div>
            {#if result}
              <div class="grid gap-2 text-xs" data-part="page-test-result">
                <p class="flex items-center gap-2">
                  <span class={cn('rounded-md px-1.5 py-0.5 font-semibold', result.ok ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive')}>{result.ok ? t('Başarılı') : t('Hata')}</span>
                  <span class="text-muted-foreground tabular-nums">{result.ms} ms</span>
                </p>
                {#if result.error}<pre class="overflow-auto rounded-md bg-destructive/10 p-2 whitespace-pre-wrap text-destructive">{result.error}</pre>{/if}
                {#if result.response}
                  <pre class="max-h-64 overflow-auto rounded-md bg-muted p-2 whitespace-pre-wrap">{result.response.type === 'redirect'
                      ? `→ ${result.response.status} ${result.response.url}`
                      : result.response.type === 'none'
                        ? t('(yanıt yok — sayfa normal gösterilir)')
                        : result.response.type === 'status'
                          ? `HTTP ${result.response.status}`
                          : `HTTP ${result.response.status} · ${result.response.type}\n\n${pretty(result.response.body)}`}</pre>
                {/if}
                {#if result.logs.length}
                  <p class="font-semibold text-muted-foreground">console.log</p>
                  <pre class="max-h-40 overflow-auto rounded-md bg-muted p-2 whitespace-pre-wrap">{result.logs.join('\n')}</pre>
                {/if}
              </div>
            {/if}
          </Card.Content>
        </Card.Root>
      </div>
    </div>
  {/if}
</div>
