<script lang="ts">
  import {
    CONTENT_VISIBILITY_LABELS,
    SNIPPET_PLACEMENTS,
    SNIPPET_PLACEMENT_INFO,
    TEMPLATE_VARIABLES,
    type AdminSnippet,
    type CustomSettingsInput,
    type SnippetInput,
    type SnippetPlacement,
  } from '@forum/shared';
  import { untrack } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import CodeBlockIcon from 'phosphor-svelte/lib/CodeBlock';
  import BracketsIcon from 'phosphor-svelte/lib/BracketsAngle';
  import ArrowLineDownIcon from 'phosphor-svelte/lib/ArrowLineDown';
  import ArrowLineUpIcon from 'phosphor-svelte/lib/ArrowLineUp';
  import CodeIcon from 'phosphor-svelte/lib/Code';
  import SidebarIcon from 'phosphor-svelte/lib/SidebarSimple';
  import TabsIcon from 'phosphor-svelte/lib/Tabs';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import DotsIcon from 'phosphor-svelte/lib/DotsThreeVertical';
  import KeyIcon from 'phosphor-svelte/lib/Key';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheck';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import RotateIcon from 'phosphor-svelte/lib/ArrowsClockwise';
  import FileCssIcon from 'phosphor-svelte/lib/FileCss';
  import PlugsIcon from 'phosphor-svelte/lib/PlugsConnected';
  import InfoIcon from 'phosphor-svelte/lib/Info';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Sheet from '$lib/components/ui/sheet';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SaveBar from '$lib/components/admin/SaveBar.svelte';
  import SettingRow from '$lib/components/admin/SettingRow.svelte';
  import VisibilityField from '$lib/components/admin/VisibilityField.svelte';
  import Field from '$lib/components/Field.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import CodeEditor from '$lib/components/CodeEditor.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { localeTag, t } from '$lib/i18n.svelte';
  import { cn, type IconComponent } from '$lib/utils';

  let { data } = $props();

  const ICONS: Record<SnippetPlacement, IconComponent> = {
    head: BracketsIcon,
    afterHeader: ArrowLineDownIcon,
    beforeFooter: ArrowLineUpIcon,
    bodyEnd: CodeIcon,
    profileSidebar: SidebarIcon,
    profileTab: TabsIcon,
  };

  let tab = $state('snippets');
  const snippets = $derived(data.custom?.snippets ?? []);
  const byPlacement = $derived(Object.fromEntries(SNIPPET_PLACEMENTS.map((p) => [p, snippets.filter((sn) => sn.placement === p)])) as Record<SnippetPlacement, AdminSnippet[]>);

  // ---------- Genel ayarlar (CSS, güvenlik, belirteç süresi): tek kaydetme çubuğu ----------
  type CspKey = keyof CustomSettingsInput['csp'];
  const CSP_ROWS: Array<{ key: CspKey; label: string; description: string }> = [
    { key: 'script', label: 'Betik kaynakları (script-src)', description: 'Dışarıdan yüklenen JavaScript dosyaları: CDN, sohbet eklentisi, UCP betiği.' },
    { key: 'connect', label: 'Bağlantı adresleri (connect-src)', description: 'fetch / WebSocket ile veri çekilen API adresleri (ör. UCP API, sunucu durumu).' },
    { key: 'style', label: 'Stil kaynakları (style-src)', description: 'Dış CSS dosyaları (ör. Google Fonts CSS).' },
    { key: 'font', label: 'Yazı tipi kaynakları (font-src)', description: 'Dış yazı tipi dosyaları (ör. fonts.gstatic.com).' },
  ];
  let enabled = $state(true);
  let css = $state('');
  let tokenTtl = $state(300);
  let csp = $state<Record<CspKey, string>>({ script: '', connect: '', style: '', font: '' });
  let saving = $state(false);
  let cspErrors = $state<Partial<Record<CspKey, string>>>({});

  const lines = (text: string) =>
    text
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  function current(): CustomSettingsInput {
    return { enabled, css, tokenTtl: Number(tokenTtl), csp: { script: lines(csp.script), connect: lines(csp.connect), style: lines(csp.style), font: lines(csp.font) } };
  }
  let snapshot = $state('');
  function sync() {
    const s = data.custom?.settings;
    if (!s) return;
    enabled = s.enabled;
    css = s.css;
    tokenTtl = s.tokenTtl;
    csp = { script: s.csp.script.join('\n'), connect: s.csp.connect.join('\n'), style: s.csp.style.join('\n'), font: s.csp.font.join('\n') };
    cspErrors = {};
    snapshot = JSON.stringify(current());
  }
  // Sunucudan yeni veri gelince eşitlenir; sync kendi okumalarını izlemez (düzenlemeler geri alınmasın).
  $effect.pre(() => {
    void data.custom;
    untrack(sync);
  });
  const dirty = $derived(JSON.stringify(current()) !== snapshot);

  async function saveSettings() {
    saving = true;
    cspErrors = {};
    try {
      await api.put('/api/admin/custom/settings', current());
      toast.success(t('Ayarlar kaydedildi. Değişiklikler forumun bir sonraki yüklenişinde uygulanır.'));
      await invalidate('app:admin-custom');
    } catch (e) {
      if (e instanceof ApiError) {
        for (const [path, msg] of Object.entries(e.fields)) {
          const key = path.split('.')[1] as CspKey | undefined;
          if (key && key in csp) cspErrors[key] = msg;
        }
        toast.error(Object.values(e.fields)[0] ?? e.message);
      } else toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }

  // ---------- Parçacık düzenleyici ----------
  let editOpen = $state(false);
  let editId = $state<number | null>(null);
  let edit = $state<SnippetInput>(blank('afterHeader'));
  let editErrors = $state<Record<string, string>>({});
  let editSaving = $state(false);
  let showVars = $state(false);

  function blank(placement: SnippetPlacement): SnippetInput {
    return { name: '', placement, title: null, html: '', visibility: 'all', groupIds: [], isEnabled: true, sortOrder: 0 };
  }
  function openNew(placement: SnippetPlacement) {
    editId = null;
    edit = blank(placement);
    editErrors = {};
    editOpen = true;
  }
  function openEdit(sn: AdminSnippet) {
    editId = sn.id;
    const { id: _id, updatedAt: _u, ...rest } = sn;
    edit = { ...rest, groupIds: [...rest.groupIds] };
    editErrors = {};
    editOpen = true;
  }
  const needsTitle = $derived(edit.placement === 'profileTab' || edit.placement === 'profileSidebar');

  async function saveSnippet() {
    editSaving = true;
    editErrors = {};
    try {
      const body = { ...edit, title: needsTitle ? edit.title : null };
      if (editId) await api.put(`/api/admin/custom/snippets/${editId}`, body);
      else await api.post('/api/admin/custom/snippets', body);
      toast.success(editId ? t('Parçacık güncellendi.') : t('Parçacık eklendi.'));
      editOpen = false;
      await invalidate('app:admin-custom');
    } catch (e) {
      if (e instanceof ApiError) {
        editErrors = e.fields;
        toast.error(Object.values(e.fields)[0] ?? e.message);
      } else toast.error(errorMessage(e));
    } finally {
      editSaving = false;
    }
  }

  async function toggle(sn: AdminSnippet, on: boolean) {
    try {
      const { id: _id, updatedAt: _u, ...rest } = sn;
      await api.put(`/api/admin/custom/snippets/${sn.id}`, { ...rest, isEnabled: on });
      await invalidate('app:admin-custom');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function remove(sn: AdminSnippet) {
    if (
      !(await confirmAction({
        title: t('"{name}" silinsin mi?', { name: sn.name }),
        description: t('Kod kalıcı olarak silinir. Geçici olarak durdurmak için kapatmanız yeterli.'),
        confirmLabel: t('Sil'),
        destructive: true,
      }))
    )
      return;
    try {
      await api.delete(`/api/admin/custom/snippets/${sn.id}`);
      toast.success(t('Parçacık silindi.'));
      await invalidate('app:admin-custom');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  // ---------- Entegrasyon anahtarı ----------
  const integration = $derived(data.custom?.integration);
  let newSecret = $state<string | null>(null);
  let rotating = $state(false);
  async function rotate() {
    if (
      integration?.hasSecret &&
      !(await confirmAction({
        title: t('Anahtar yenilensin mi?'),
        description: t('Eski anahtar hemen geçersiz olur; UCP tarafındaki anahtarı da güncellemeniz gerekir.'),
        confirmLabel: t('Yenile'),
        destructive: true,
      }))
    )
      return;
    rotating = true;
    try {
      newSecret = (await api.post<{ secret: string }>('/api/admin/custom/secret')).secret;
      await invalidate('app:admin-custom');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      rotating = false;
    }
  }
  async function removeSecret() {
    if (!(await confirmAction({ title: t('Anahtar kaldırılsın mı?'), description: t('Entegrasyon belirteci verilmez; UCP girişleri çalışmaz.'), confirmLabel: t('Kaldır'), destructive: true }))) return;
    try {
      await api.delete('/api/admin/custom/secret');
      toast.success(t('Anahtar kaldırıldı.'));
      await invalidate('app:admin-custom');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('Kopyalandı.'));
    } catch {
      toast.error(t('Kopyalanamadı; metni elle seçin.'));
    }
  }

  // Belgelerdeki örnek kodlar (kapanış etiketleri Svelte betiğini bitirmesin diye kaçışlı).
  const SAMPLE_FORUM = $derived([
    `<div id="ucp-characters">${t('Yükleniyor…')}</div>`,
    '<script>',
    '  window.forum.token().then(function (token) {',
    "    return fetch('https://ucp.example.com/api/characters', {",
    "      headers: { Authorization: 'Bearer ' + token }",
    '    });',
    '  }).then(function (r) { return r.json(); }).then(function (list) {',
    `    document.getElementById('ucp-characters').textContent = list.length + ' ${t('karakter')}';`,
    '  });',
    '</' + 'script>',
  ].join('\n'));
  const SAMPLE_NODE = $derived([
    "import { createHmac, timingSafeEqual } from 'node:crypto';",
    '',
    'export function verifyForumToken(token, secret) {',
    "  const [h, p, s] = String(token).split('.');",
    '  if (!h || !p || !s) return null;',
    "  const expected = createHmac('sha256', secret).update(h + '.' + p).digest('base64url');",
    '  if (s.length !== expected.length || !timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;',
    "  const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));",
    `  return claims.exp * 1000 > Date.now() ? claims : null; // claims.sub = ${t('forum üye numarası')}`,
    '}',
  ].join('\n'));
  const SAMPLE_PHP = $derived([
    '<?php',
    'function forum_verify_token(string $token, string $secret): ?array {',
    "    $parts = explode('.', $token);",
    '    if (count($parts) !== 3) return null;',
    '    [$h, $p, $s] = $parts;',
    "    $b64 = fn($d) => rtrim(strtr(base64_encode($d), '+/', '-_'), '=');",
    "    if (!hash_equals($b64(hash_hmac('sha256', $h . '.' . $p, $secret, true)), $s)) return null;",
    "    $claims = json_decode(base64_decode(strtr($p, '-_', '+/')), true);",
    `    return ($claims['exp'] ?? 0) > time() ? $claims : null; // $claims['sub'] = ${t('forum üye numarası')}`,
    '}',
  ].join('\n'));
  const CLAIMS: Array<[string, string]> = [
    ['sub', 'Forum üye numarası (metin)'],
    ['username / name', 'Kullanıcı adı ve görünen ad'],
    ['groups / primaryGroup', 'Grup numaraları ve ana grup'],
    ['emailVerified', 'E-posta doğrulandı mı'],
    ['iat / exp', 'Veriliş ve bitiş zamanı (Unix saniye)'],
    ['iss / jti', 'Forum adresi ve tek kullanımlık kimlik'],
  ];
  const placementOptions = $derived(SNIPPET_PLACEMENTS.map((p) => ({ value: p, label: t(SNIPPET_PLACEMENT_INFO[p].label), description: t(SNIPPET_PLACEMENT_INFO[p].description) })));
</script>

<svelte:head><title>{t('Özel kod ve entegrasyon · Yönetim')}</title></svelte:head>

<PageHeader
  title={t('Özel kod ve entegrasyon')}
  description={t('Forumun belirli yerlerine kendi HTML / CSS / JavaScript kodunu ekle; UCP gibi dış sistemleri imzalı üye kimliğiyle bağla.')}
  icon={CodeBlockIcon}
>
  {#snippet actions()}
    <Button variant="outline" href="/?safemode=1" target="_blank" data-sveltekit-reload><ShieldCheckIcon />{t('Güvenli modda aç')}</Button>
  {/snippet}
</PageHeader>

{#snippet sample(code: string, lang: string)}
  <div class="relative overflow-hidden rounded-md border bg-muted/30">
    <div class="flex items-center border-b px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
      {lang}
      <button type="button" class="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground" onclick={() => copy(code)}><CopyIcon class="size-3.5" />{t('Kopyala')}</button>
    </div>
    <pre class="overflow-x-auto p-3 font-mono text-xs leading-5">{code}</pre>
  </div>
{/snippet}

{#if data.custom}
  {#if !enabled}
    <div class="mb-4 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      <EyeSlashIcon class="size-4 shrink-0" />{t('Özel kod şu an')} <b>{t('kapalı')}</b>: {t('parçacıklar, HTML blokları ve HTML sayfaları ziyaretçilere gönderilmiyor. "Güvenlik" sekmesinden açabilirsin.')}
    </div>
  {/if}

  <Tabs.Root bind:value={tab}>
    <Tabs.List class="mb-4 max-w-full justify-start overflow-x-auto">
      <Tabs.Trigger value="snippets"><CodeIcon />{t('Kod parçacıkları')} <span class="ml-1 rounded bg-muted px-1.5 text-[11px] font-bold">{snippets.length}</span></Tabs.Trigger>
      <Tabs.Trigger value="css"><FileCssIcon />{t('Özel CSS')}</Tabs.Trigger>
      <Tabs.Trigger value="security"><ShieldCheckIcon />{t('Güvenlik')}</Tabs.Trigger>
      <Tabs.Trigger value="integration"><PlugsIcon />{t('UCP entegrasyonu')}</Tabs.Trigger>
    </Tabs.List>

    <!-- Parçacıklar -->
    <Tabs.Content value="snippets" class="grid gap-4">
      <div class="grid gap-4 xl:grid-cols-2">
        {#each SNIPPET_PLACEMENTS as placement (placement)}
          {@const Icon = ICONS[placement]}
          {@const info = SNIPPET_PLACEMENT_INFO[placement]}
          <section class="overflow-hidden rounded-xl border bg-card" data-placement={placement}>
            <header class="flex items-start gap-3 border-b px-4 py-3">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Icon class="size-5" /></span>
              <div class="min-w-0 flex-1">
                <h2 class="text-sm font-bold">{t(info.label)}</h2>
                <p class="text-xs text-muted-foreground">{t(info.description)}</p>
              </div>
              <Button size="sm" variant="outline" onclick={() => openNew(placement)}><PlusIcon weight="bold" />{t('Ekle')}</Button>
            </header>
            {#each byPlacement[placement] as sn (sn.id)}
              <div class={cn('flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0', !sn.isEnabled && 'opacity-60')}>
                <Switch checked={sn.isEnabled} onCheckedChange={(v) => toggle(sn, v)} aria-label={t('{name} etkin', { name: sn.name })} />
                <button type="button" class="grid min-w-0 flex-1 text-left" onclick={() => openEdit(sn)}>
                  <span class="truncate text-sm font-semibold">{sn.name}{#if sn.title}<span class="font-normal text-muted-foreground"> · {sn.title}</span>{/if}</span>
                  <span class="truncate text-xs text-muted-foreground">{t(CONTENT_VISIBILITY_LABELS[sn.visibility])} · {t('{n} karakter', { n: sn.html.length.toLocaleString(localeTag()) })}{sn.html.includes('<script') ? ` · ${t('betik içerir')}` : ''}</span>
                </button>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    {#snippet child({ props })}<Button {...props} variant="ghost" size="icon-sm" aria-label={t('İşlemler')}><DotsIcon weight="bold" /></Button>{/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end">
                    <DropdownMenu.Item onSelect={() => openEdit(sn)}><PencilIcon />{t('Düzenle')}</DropdownMenu.Item>
                    <DropdownMenu.Item variant="destructive" onSelect={() => remove(sn)}><TrashIcon />{t('Sil')}</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>
            {:else}
              <p class="px-4 py-5 text-center text-xs text-muted-foreground">{t('Bu alanda kod yok.')}</p>
            {/each}
          </section>
        {/each}
      </div>
      <p class="flex items-start gap-2 text-xs text-muted-foreground">
        <InfoIcon class="mt-0.5 size-4 shrink-0" />
        {t('Özel kod yönetim panelinde hiçbir zaman çalışmaz. Bozuk bir kod forumu kilitlerse adresin sonuna')} <code class="rounded bg-muted px-1">?safemode=1</code>
        {t('ekleyerek tüm özel kodu kapatıp düzeltebilirsin.')}
      </p>
    </Tabs.Content>

    <!-- CSS -->
    <Tabs.Content value="css" class="grid gap-3">
      <div class="rounded-xl border bg-card p-4">
        <p class="mb-3 text-sm text-muted-foreground">
          {t('Tüm forum sayfalarına eklenir ve temanın üzerine yazılır. Bileşenleri')} <code class="rounded bg-muted px-1">[data-part="…"]</code> {t('seçicileriyle hedefleyebilirsin (ör.')}
          <code class="rounded bg-muted px-1">[data-part="site-header"]</code>); {t('temaya özel kurallar için')}
          <code class="rounded bg-muted px-1">[data-style="community"]</code> {t('kullan.')}
        </p>
        <CodeEditor bind:value={css} language="CSS" minHeight={440} maxLength={100000} placeholder={'[data-part="site-header"] {\n  border-bottom: 2px solid var(--primary);\n}'} />
      </div>
    </Tabs.Content>

    <!-- Güvenlik -->
    <Tabs.Content value="security">
      <div class="overflow-hidden rounded-xl border bg-card">
        <SettingRow label={t('Özel kod çalışsın')} description={t('Kapatınca tüm parçacıklar, özel CSS, HTML blokları ve HTML sayfaları herkes için devre dışı kalır (acil durum anahtarı).')} inline>
          <Switch bind:checked={enabled} />
        </SettingRow>
        {#each CSP_ROWS as row (row.key)}
          <SettingRow label={t(row.label)} description={t(row.description)} error={cspErrors[row.key] ?? null}>
            <Textarea bind:value={csp[row.key]} rows={3} class="font-mono text-xs" placeholder="https://ucp.ornek.com&#10;https://*.cdn.ornek.com" />
          </SettingRow>
        {/each}
      </div>
      <p class="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <InfoIcon class="mt-0.5 size-4 shrink-0" />
        {t('Forum, İçerik Güvenliği Politikası (CSP) ile korunur; yalnızca burada listelenen https:// ve wss:// adresleri özel kod tarafından kullanılabilir. Parçacıktaki betikler sayfanın güvenlik anahtarıyla çalışır, ancak')}
        <code class="rounded bg-muted px-1">onclick="…"</code> {t('gibi satır içi olaylar engellenir;')}
        <code class="rounded bg-muted px-1">addEventListener</code> {t('kullanın.')}
      </p>
    </Tabs.Content>

    <!-- Entegrasyon -->
    <Tabs.Content value="integration" class="grid gap-4">
      <div class="overflow-hidden rounded-xl border bg-card">
        <SettingRow label={t('İmza anahtarı')} description={t('UCP ile forum arasında paylaşılan gizli anahtar. Yalnızca oluşturulduğunda bir kez gösterilir.')}>
          <div class="flex flex-wrap items-center gap-2">
            {#if integration?.hasSecret}
              <span class="inline-flex items-center gap-1.5 rounded-md bg-success/15 px-2 py-1 font-mono text-xs font-semibold text-success"><KeyIcon class="size-3.5" />{integration.secretHint}</span>
              <Button size="sm" variant="outline" onclick={rotate} disabled={rotating}>{#if rotating}<LoaderIcon class="animate-spin" />{:else}<RotateIcon />{/if}{t('Yenile')}</Button>
              <Button size="sm" variant="ghost" class="text-destructive" onclick={removeSecret}><TrashIcon />{t('Kaldır')}</Button>
            {:else}
              <span class="text-sm text-muted-foreground">{t('Anahtar yok — belirteç verilmiyor.')}</span>
              <Button size="sm" onclick={rotate} disabled={rotating}>{#if rotating}<LoaderIcon class="animate-spin" />{:else}<KeyIcon />{/if}{t('Anahtar oluştur')}</Button>
            {/if}
          </div>
        </SettingRow>
        <SettingRow label={t('Belirteç süresi')} description={t('Verilen belirtecin geçerli kalacağı süre (saniye, 30–3600).')}>
          <Input type="number" min={30} max={3600} bind:value={tokenTtl} class="max-w-40" />
        </SettingRow>
        <SettingRow label={t('Belirteç adresi')} description={t('Yalnızca giriş yapmış üyenin kendi tarayıcısından (forum alan adında) çağrılabilir.')}>
          <div class="flex items-center gap-2">
            <code class="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs">POST {integration?.tokenUrl}</code>
            <Button size="icon-sm" variant="ghost" aria-label={t('Kopyala')} onclick={() => copy(integration?.tokenUrl ?? '')}><CopyIcon /></Button>
          </div>
        </SettingRow>
      </div>

      <div class="grid gap-4 xl:grid-cols-2">
        <section class="grid content-start gap-3 rounded-xl border bg-card p-4">
          <h2 class="text-sm font-bold">{t("1. Forumda: belirteci al ve UCP'ye gönder")}</h2>
          <p class="text-xs text-muted-foreground">
            {t('Bir parçacıkta ya da HTML sayfada')} <code class="rounded bg-muted px-1">window.forum.token()</code> {t('imzalı belirteci verir. UCP adresini Güvenlik sekmesinde "Bağlantı adresleri"ne ekleyin.')}
          </p>
          {@render sample(SAMPLE_FORUM, 'HTML')}
        </section>
        <section class="grid content-start gap-3 rounded-xl border bg-card p-4">
          <h2 class="text-sm font-bold">{t("2. UCP'de: imzayı doğrula")}</h2>
          <p class="text-xs text-muted-foreground">{t("Belirteç standart bir HS256 JWT'dir; herhangi bir JWT kütüphanesiyle de doğrulanabilir.")}</p>
          {@render sample(SAMPLE_PHP, 'PHP')}
          {@render sample(SAMPLE_NODE, 'Node.js')}
        </section>
      </div>
      <section class="rounded-xl border bg-card p-4">
        <h2 class="mb-2 text-sm font-bold">{t('Belirteç içeriği')}</h2>
        <dl class="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {#each CLAIMS as [k, d] (k)}
            <div class="flex gap-2"><dt class="w-40 shrink-0 font-mono text-xs leading-5 font-semibold">{k}</dt><dd class="text-xs leading-5 text-muted-foreground">{t(d)}</dd></div>
          {/each}
        </dl>
      </section>
    </Tabs.Content>
  </Tabs.Root>

  <SaveBar {dirty} {saving} onsave={saveSettings} onreset={sync} />

  <!-- Parçacık düzenleyici -->
  <Sheet.Root bind:open={editOpen}>
    <Sheet.Content side="right" class="w-full gap-0 data-[side=right]:sm:max-w-3xl">
      <Sheet.Header class="border-b">
        <Sheet.Title>{editId ? t('Parçacığı düzenle') : t('Yeni kod parçacığı')}</Sheet.Title>
        <Sheet.Description>{t(SNIPPET_PLACEMENT_INFO[edit.placement].description)}</Sheet.Description>
      </Sheet.Header>
      <div class="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label={t('Ad')} error={editErrors.name} hint={t('Yalnızca yönetimde görünür.')}>
            <Input bind:value={edit.name} maxlength={80} placeholder={t('ör. UCP karakter kartı')} />
          </Field>
          <Field label={t('Konum')}>
            <Combobox options={placementOptions} bind:value={edit.placement as never} searchable={false} />
          </Field>
        </div>
        {#if needsTitle}
          <Field label={edit.placement === 'profileTab' ? t('Sekme adı') : t('Kart başlığı')} error={editErrors.title}>
            <Input bind:value={edit.title} maxlength={60} placeholder={edit.placement === 'profileTab' ? t('ör. Karakterler') : t('ör. Oyun bilgileri')} />
          </Field>
        {/if}
        <Field label={t('Kod')} error={editErrors.html}>
          <CodeEditor bind:value={edit.html} minHeight={340} maxLength={100000} placeholder={'<div class="kutu">Merhaba {{viewer.username}}!</div>'} />
        </Field>
        <div>
          <button type="button" class="inline-flex items-center gap-1.5 text-xs font-semibold text-link hover:underline" onclick={() => (showVars = !showVars)}>
            <InfoIcon class="size-3.5" />{showVars ? t('Değişkenleri gizle') : t('Kullanılabilir değişkenler ve window.forum')}
          </button>
          {#if showVars}
            <div class="mt-2 grid gap-1 rounded-md border bg-muted/30 p-3 text-xs">
              {#each TEMPLATE_VARIABLES.filter((v) => v.scope === 'all' || edit.placement.startsWith('profile')) as v (v.key)}
                <div class="flex gap-3"><code class="w-48 shrink-0 font-mono font-semibold">{`{{${v.key}}}`}</code><span class="text-muted-foreground">{t(v.label)}</span></div>
              {/each}
              <div class="mt-2 border-t pt-2 text-muted-foreground">
                JavaScript: <code class="font-mono">window.forum.viewer</code> {t('(üye bilgisi),')} <code class="font-mono">window.forum.token()</code> {t('(UCP belirteci),')}
                <code class="font-mono">window.forum.onNavigate(fn)</code> {t('(sayfa geçişleri).')}
              </div>
            </div>
          {/if}
        </div>
        <VisibilityField bind:visibility={edit.visibility} bind:groupIds={edit.groupIds} groups={data.groups} error={editErrors.groupIds} />
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label={t('Sıra')} hint={t('Aynı konumdaki parçacıklar küçükten büyüğe dizilir.')}>
            <Input type="number" min={0} max={10000} bind:value={edit.sortOrder} />
          </Field>
          <label class="flex items-center gap-3 self-end pb-2 text-sm"><Switch bind:checked={edit.isEnabled} />{t('Etkin')}</label>
        </div>
      </div>
      <Sheet.Footer class="flex-row justify-end gap-2 border-t">
        <Button variant="ghost" onclick={() => (editOpen = false)}>{t('Vazgeç')}</Button>
        <Button onclick={saveSnippet} disabled={editSaving || !edit.name.trim()}>{#if editSaving}<LoaderIcon class="animate-spin" />{/if}{editId ? t('Kaydet') : t('Ekle')}</Button>
      </Sheet.Footer>
    </Sheet.Content>
  </Sheet.Root>

  <!-- Yeni anahtar: yalnızca bir kez gösterilir -->
  <Dialog.Root open={newSecret !== null} onOpenChange={(o) => !o && (newSecret = null)}>
    <Dialog.Content class="sm:max-w-lg">
      <Dialog.Header>
        <Dialog.Title>{t('Yeni imza anahtarı')}</Dialog.Title>
        <Dialog.Description>{t('Bu anahtarı şimdi kopyalayıp UCP sunucunuzun ayarlarına ekleyin. Güvenlik gereği bir daha gösterilmez.')}</Dialog.Description>
      </Dialog.Header>
      <div class="flex items-center gap-2">
        <code class="min-w-0 flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all select-all">{newSecret}</code>
        <Button variant="outline" size="icon" aria-label={t('Kopyala')} onclick={() => copy(newSecret ?? '')}><CopyIcon /></Button>
      </div>
      <Dialog.Footer><Button onclick={() => (newSecret = null)}>{t('Kopyaladım')}</Button></Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{/if}
