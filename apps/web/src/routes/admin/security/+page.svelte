<script lang="ts">
  import { WAF_CAPTCHAS, WAF_CAPTCHA_INFO, WAF_MODES, WAF_MODE_INFO, type WafConfigInput } from '@forum/shared';
  import { untrack } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/ShieldCheckered';
  import FloppyIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import EyeIcon from 'phosphor-svelte/lib/Eye';
  import ProhibitIcon from 'phosphor-svelte/lib/Prohibit';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import HourglassIcon from 'phosphor-svelte/lib/HourglassMedium';
  import GaugeIcon from 'phosphor-svelte/lib/Gauge';
  import WarningIcon from 'phosphor-svelte/lib/Warning';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { formatDateTime, formatNumber } from '$lib/format';
  import { cn } from '$lib/utils';
  import { localeTag, t } from '$lib/i18n.svelte';

  let { data } = $props();
  const w = $derived(data.waf);

  const toForm = (): WafConfigInput & { secretKey: string } => {
    const c = data.waf!.config;
    const { hasSecret: _h, ...rest } = c;
    return { ...structuredClone(rest), secretKey: '' };
  };
  let form = $state(untrack(() => (data.waf ? toForm() : null)));
  let allowIps = $state(untrack(() => form?.allowIps.join('\n') ?? ''));
  let blockIps = $state(untrack(() => form?.blockIps.join('\n') ?? ''));
  let blockUas = $state(untrack(() => form?.blockUserAgents.join('\n') ?? ''));
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

  async function save() {
    if (!form) return;
    saving = true;
    errors = {};
    try {
      const body = { ...form, secretKey: form.secretKey || undefined, allowIps: lines(allowIps), blockIps: lines(blockIps), blockUserAgents: lines(blockUas) };
      await api.put('/api/admin/waf', body);
      form.secretKey = '';
      toast.success(form.enabled ? t('Güvenlik duvarı ayarları kaydedildi.') : t('Kaydedildi; güvenlik duvarı kapalı.'));
      await invalidate('app:admin-waf');
    } catch (e) {
      if (e instanceof ApiError) {
        errors = e.fields;
        toast.error(Object.values(e.fields)[0] ?? e.message);
      } else toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }
  async function unblock(ip: string) {
    try {
      await api.post('/api/admin/waf/unblock', { ip });
      toast.success(t('{ip} engeli kaldırıldı.', { ip }));
      await invalidate('app:admin-waf');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  const ACTION: Record<string, { l: string; c: string }> = {
    block: { l: 'Engellendi', c: 'bg-destructive/15 text-destructive' },
    challenge: { l: 'Doğrulama', c: 'bg-warning/15 text-warning' },
    pass: { l: 'Geçti', c: 'bg-success/15 text-success' },
    ratelimit: { l: 'Hız sınırı', c: 'bg-primary-soft text-highlight' },
  };
</script>

<svelte:head><title>{t('Güvenlik duvarı · Yönetim')}</title></svelte:head>

<PageHeader icon={PageHeaderIcon} title={t('Güvenlik duvarı (WAF)')} description={t('Saldırı kalıplarını, zararlı botları ve aşırı istekleri engeller; gerekirse ziyaretçileri siteye girmeden önce doğrular.')}>
  {#snippet actions()}
    <Button variant="outline" href="/api/admin/waf/preview" target="_blank"><EyeIcon />{t('Doğrulama sayfasını önizle')}</Button>
    <Button onclick={save} disabled={saving || !form}>{#if saving}<LoaderIcon class="animate-spin" />{:else}<FloppyIcon />{/if}{t('Kaydet')}</Button>
  {/snippet}
</PageHeader>

{#if w && form}
  {#if w.forcedOff}
    <p class="mb-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"><WarningIcon class="size-5 shrink-0" />{t('.env dosyasında WAF_DISABLED=true olduğu için güvenlik duvarı şu an devre dışı.')}</p>
  {/if}

  <div class="grid gap-5">
    <!-- Durum -->
    <section class={cn('grid gap-5 rounded-2xl border p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center', form.enabled ? 'border-success/40 bg-success/5' : 'bg-card')}>
      <div class="flex items-center gap-4">
        <span class={cn('flex size-12 items-center justify-center rounded-2xl', form.enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}><PageHeaderIcon class="size-6" weight="duotone" /></span>
        <div>
          <p class="text-lg font-bold">{form.enabled ? t('Koruma açık') : t('Koruma kapalı')}</p>
          <p class="text-sm text-muted-foreground">{t('Son 24 saatte {blocked} istek engellendi, {challenged} doğrulama gösterildi.', { blocked: formatNumber(w.stats.blocked24h), challenged: formatNumber(w.stats.challenged24h) })}</p>
        </div>
      </div>
      <label class="flex items-center gap-3 text-sm font-bold">{t('Güvenlik duvarı')} <Switch bind:checked={form.enabled} /></label>
    </section>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {#each [{ l: t('Engellenen'), v: w.stats.blocked24h, i: ProhibitIcon, c: 'text-destructive' }, { l: t('Doğrulama'), v: w.stats.challenged24h, i: HourglassIcon, c: 'text-warning' }, { l: t('Doğrulamayı geçen'), v: w.stats.passed24h, i: CheckCircleIcon, c: 'text-success' }, { l: t('Hız sınırı'), v: w.stats.rateLimited24h, i: GaugeIcon, c: 'text-primary' }] as s (s.l)}
        <div class="rounded-xl border bg-card p-4"><s.i class={cn('size-5', s.c)} weight="duotone" /><p class="mt-2 text-2xl font-black tabular-nums">{formatNumber(s.v)}</p><p class="text-xs text-muted-foreground">{t('{label} · 24 saat', { label: s.l })}</p></div>
      {/each}
    </div>

    <div class="grid gap-5 xl:grid-cols-2">
      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Doğrulama sayfası')}</Card.Title><Card.Description>{t('Kimler siteye girmeden önce doğrulansın?')}</Card.Description></Card.Header>
        <Card.Content class="grid gap-4">
          <div class="grid gap-2">
            {#each WAF_MODES as m (m)}
              <label class={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors', form.mode === m ? 'border-primary bg-primary-soft' : 'hover:bg-accent')}>
                <input type="radio" bind:group={form.mode} value={m} class="mt-1 accent-[var(--primary)]" />
                <span class="grid"><span class="text-sm font-bold">{t(WAF_MODE_INFO[m].label)}</span><span class="text-xs text-muted-foreground">{t(WAF_MODE_INFO[m].description)}</span></span>
              </label>
            {/each}
          </div>
          <div class="grid gap-2">
            <span class="text-sm font-semibold">{t('Doğrulama türü')}</span>
            <div class="grid gap-2 sm:grid-cols-3">
              {#each WAF_CAPTCHAS as c (c)}
                <button type="button" onclick={() => form && (form.captcha = c)} class={cn('grid gap-1 rounded-lg border p-3 text-left transition-colors', form.captcha === c ? 'border-primary bg-primary-soft' : 'hover:bg-accent')}>
                  <span class="text-sm font-bold">{t(WAF_CAPTCHA_INFO[c].label)}</span><span class="text-[11px] leading-snug text-muted-foreground">{t(WAF_CAPTCHA_INFO[c].description)}</span>
                </button>
              {/each}
            </div>
          </div>
          {#if form.captcha !== 'builtin'}
            <div class="grid gap-3 sm:grid-cols-2">
              <Field label={t('Site anahtarı')} error={errors.siteKey}><Input bind:value={form.siteKey} class="font-mono text-xs" autocomplete="off" /></Field>
              <Field label={t('Gizli anahtar')} hint={w.config.hasSecret ? t('Kayıtlı; değiştirmek için yazın.') : t('Şifreli saklanır.')}><Input type="password" bind:value={form.secretKey} autocomplete="new-password" placeholder={w.config.hasSecret ? '••••••••' : ''} /></Field>
            </div>
          {/if}
          <div class="grid gap-3 border-t pt-4">
            <Field label={t('Başlık')}><Input bind:value={form.title} maxlength={120} /></Field>
            <Field label={t('Açıklama')}><Textarea bind:value={form.message} rows={2} maxlength={600} /></Field>
            <div class="grid grid-cols-2 gap-3">
              <Field label={t('Düğme yazısı')}><Input bind:value={form.buttonLabel} maxlength={40} /></Field>
              <Field label={t('Doğrulama geçerliliği (saat)')}><Input type="number" bind:value={form.clearanceHours} min={1} max={720} /></Field>
            </div>
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Kurallar')}</Card.Title><Card.Description>{t('Doğrulama modundan bağımsız, koruma açıkken her zaman uygulanır.')}</Card.Description></Card.Header>
        <Card.Content class="grid gap-4">
          <label class="flex items-center justify-between gap-3 text-sm"><span class="grid"><span class="font-semibold">{t('Saldırı kalıplarını engelle')}</span><span class="text-xs text-muted-foreground">{t('SQL enjeksiyonu, XSS, dizin gezinme ve .env / wp-admin taramaları; 10 dakikada 3 deneme 1 saat engel.')}</span></span><Switch bind:checked={form.blockPatterns} /></label>
          <label class="flex items-center justify-between gap-3 text-sm"><span class="grid"><span class="font-semibold">{t('Arama motorları ve bağlantı önizlemeleri geçsin')}</span><span class="text-xs text-muted-foreground">{t('Google, Bing, Yandex (ters DNS ile doğrulanır); Discord, WhatsApp, X önizlemeleri doğrulama görmez.')}</span></span><Switch bind:checked={form.allowSearchBots} /></label>
          <Field label={t('IP başına dakikada en fazla istek')} hint={t('Aşan IP 1 dakika bekletilir; iki katını aşan 5 dakika engellenir.')}><Input type="number" bind:value={form.rateLimitPerMinute} min={30} max={10000} class="w-40" /></Field>
          <div class="grid gap-3 sm:grid-cols-2">
            <Field label={t("İzinli IP'ler")} hint={t('Her satıra bir IP ya da aralık (1.2.3.0/24). Hiç denetlenmez.')}><Textarea bind:value={allowIps} rows={4} class="font-mono text-xs" /></Field>
            <Field label={t("Engelli IP'ler")}><Textarea bind:value={blockIps} rows={4} class="font-mono text-xs" /></Field>
          </div>
          <Field label={t('Engelli istemciler (tarayıcı kimliğinde geçen)')} hint={t('Saldırı araçları: sqlmap, nikto…')}><Textarea bind:value={blockUas} rows={3} class="font-mono text-xs" /></Field>
        </Card.Content>
      </Card.Root>
    </div>

    <p class="rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">{t('Kendinizi dışarıda bırakırsanız (ör. hatalı captcha anahtarı): sunucudaki')} <code>.env</code> {t('dosyasına')} <code>WAF_DISABLED=true</code> {t('ekleyip uygulamayı yeniden başlatın. Giriş yapmış üyeler doğrulama sayfası görmez.')}</p>

    {#if w.stats.activeBlocks.length}
      <Card.Root>
        <Card.Header><Card.Title class="text-base">{t('Geçici engeller')}</Card.Title></Card.Header>
        <Card.Content class="divide-y p-0">
          {#each w.stats.activeBlocks as b (b.ip)}
            <div class="flex items-center gap-3 px-5 py-2.5 text-sm">
              <code class="font-bold">{b.ip}</code><span class="min-w-0 flex-1 truncate text-muted-foreground">{b.reason}</span><span class="text-xs text-muted-foreground">{t('{date} tarihine kadar', { date: formatDateTime(b.until) })}</span>
              <Button variant="ghost" size="sm" onclick={() => unblock(b.ip)}>{t('Kaldır')}</Button>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    {/if}

    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Son olaylar')}</Card.Title><Card.Description>{t('Sunucu yeniden başlayınca sıfırlanır.')}</Card.Description></Card.Header>
      <Card.Content class="p-0">
        {#if w.events.length}
          <div class="max-h-[28rem] divide-y overflow-y-auto">
            {#each w.events as e, i (i)}
              <div class="grid grid-cols-[6.5rem_7rem_minmax(0,1fr)] items-center gap-3 px-5 py-2 text-xs sm:grid-cols-[6.5rem_7rem_10rem_minmax(0,1fr)]">
                <span class="text-muted-foreground tabular-nums">{new Date(e.at).toLocaleTimeString(localeTag())}</span>
                <span class={cn('w-fit rounded-full px-2 py-0.5 font-bold', ACTION[e.action]?.c)}>{t(ACTION[e.action]?.l ?? '')}</span>
                <code class="hidden truncate sm:block">{e.ip}</code>
                <span class="min-w-0 truncate" title={`${e.path} · ${e.ua}`}>{e.reason} · <span class="text-muted-foreground">{e.path}</span></span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="px-5 pb-5 text-sm text-muted-foreground">{t('Henüz olay yok.')}</p>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>
{/if}
