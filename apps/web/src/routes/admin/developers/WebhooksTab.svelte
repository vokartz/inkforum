<script lang="ts">
  import { WEBHOOK_EVENTS, WEBHOOK_EVENT_INFO, type AdminWebhook, type Paginated, type WebhookDelivery, type WebhookEvent } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import WebhooksIcon from 'phosphor-svelte/lib/WebhooksLogo';
  import PaperPlaneIcon from 'phosphor-svelte/lib/PaperPlaneTilt';
  import KeyIcon from 'phosphor-svelte/lib/Key';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import ArrowsClockwiseIcon from 'phosphor-svelte/lib/ArrowsClockwise';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import Field from '$lib/components/Field.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDateTime } from '$lib/format';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';
  import SecretDialog from './SecretDialog.svelte';

  let { webhooks }: { webhooks: AdminWebhook[] } = $props();

  let open = $state(false);
  let editId = $state<number | null>(null);
  let name = $state('');
  let url = $state('');
  let events = $state<WebhookEvent[]>(['topic.created']);
  let enabled = $state(true);
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);
  let secrets = $state<Array<{ label: string; value: string }> | null>(null);
  let log = $state<Paginated<WebhookDelivery> | null>(null);
  let pinging = $state(false);
  let expanded = $state<number | null>(null);

  async function loadLog(id: number, p = 1) {
    log = await api.get<Paginated<WebhookDelivery>>(`/api/admin/developers/webhooks/${id}/deliveries?page=${p}`);
  }
  function openNew() {
    editId = null;
    name = '';
    url = '';
    events = ['topic.created'];
    enabled = true;
    errors = {};
    log = null;
    open = true;
  }
  function openEdit(h: AdminWebhook) {
    editId = h.id;
    name = h.name;
    url = h.url;
    events = [...h.events];
    enabled = h.isEnabled;
    errors = {};
    log = null;
    open = true;
    void loadLog(h.id);
  }
  async function save() {
    saving = true;
    errors = {};
    try {
      const body = { name, url, events, isEnabled: enabled };
      if (editId) await api.put(`/api/admin/developers/webhooks/${editId}`, body);
      else {
        const res = await api.post<{ hook: AdminWebhook; secret: string }>('/api/admin/developers/webhooks', body);
        secrets = [{ label: t('İmza anahtarı (secret)'), value: res.secret }];
        editId = res.hook.id;
      }
      toast.success(t('Webhook kaydedildi.'));
      await invalidate('app:admin-developers');
      if (editId) void loadLog(editId);
    } catch (e) {
      if (e instanceof ApiError) {
        errors = e.fields;
        toast.error(Object.values(e.fields)[0] ?? e.message);
      } else toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }
  async function ping() {
    if (!editId) return;
    pinging = true;
    try {
      const d = await api.post<WebhookDelivery>(`/api/admin/developers/webhooks/${editId}/ping`);
      if (d.status === 'success') toast.success(t('Bağlantı çalışıyor (HTTP {code}, {ms} ms).', { code: d.responseCode, ms: d.durationMs }));
      else toast.error(t('Başarısız: {error}', { error: d.error ?? `HTTP ${d.responseCode}` }));
      await loadLog(editId);
      await invalidate('app:admin-developers');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      pinging = false;
    }
  }
  async function rotate() {
    if (!editId) return;
    if (!(await confirmAction({ title: t('İmza anahtarı yenilensin mi?'), description: t('Alıcı tarafta da yeni anahtarı kullanman gerekir.'), confirmLabel: t('Yenile'), destructive: true }))) return;
    const res = await api.post<{ secret: string }>(`/api/admin/developers/webhooks/${editId}/secret`);
    secrets = [{ label: t('İmza anahtarı (secret)'), value: res.secret }];
  }
  async function remove() {
    if (!editId) return;
    if (!(await confirmAction({ title: t('Webhook silinsin mi?'), description: t('Gönderim kayıtları da silinir.'), confirmLabel: t('Sil'), destructive: true }))) return;
    await api.delete(`/api/admin/developers/webhooks/${editId}`);
    open = false;
    await invalidate('app:admin-developers');
  }
  async function redeliver(d: WebhookDelivery) {
    const r = await api.post<WebhookDelivery>(`/api/admin/developers/deliveries/${d.id}/redeliver`);
    toast[r.status === 'success' ? 'success' : 'error'](r.status === 'success' ? t('Yeniden gönderildi.') : t('Başarısız: {error}', { error: r.error ?? `HTTP ${r.responseCode}` }));
    if (editId) await loadLog(editId);
  }
  const statusColor = (s: string) => (s === 'success' ? 'bg-success' : s === 'failed' ? 'bg-destructive' : 'bg-warning');
</script>

<div class="grid gap-4">
  <div class="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
    <div class="min-w-0 flex-1">
      <h2 class="font-bold">{t("Webhook'lar")}</h2>
      <p class="text-sm text-muted-foreground">{t('Forumda bir şey olduğunda (yeni konu, kayıt, grup değişimi, yasak…) adresine imzalı JSON gönderilir. Discord botu, UCP senkronizasyonu, log sistemi için.')}</p>
    </div>
    <Button onclick={openNew}><PlusIcon weight="bold" />{t('Yeni webhook')}</Button>
  </div>

  {#if webhooks.length}
    <div class="grid gap-2">
      {#each webhooks as h (h.id)}
        <button type="button" onclick={() => openEdit(h)} class={cn('flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-primary', !h.isEnabled && 'opacity-60')}>
          <span class={cn('size-2.5 shrink-0 rounded-full', h.lastStatus === null ? 'bg-muted-foreground/40' : h.lastStatus >= 200 && h.lastStatus < 300 ? 'bg-success' : 'bg-destructive')}></span>
          <span class="grid min-w-0 flex-1">
            <span class="font-semibold">{h.name}</span>
            <span class="truncate font-mono text-xs text-muted-foreground">{h.url}</span>
          </span>
          <span class="hidden flex-wrap justify-end gap-1 sm:flex">{#each h.events as e (e)}<span class="rounded bg-muted px-1.5 py-px font-mono text-[10px]">{e}</span>{/each}</span>
          <span class="w-28 shrink-0 text-right text-xs text-muted-foreground">
            {#if h.lastDeliveryAt}<TimeAgo ms={h.lastDeliveryAt} />{#if h.failureCount}<span class="block text-destructive">{t('{n} hata', { n: h.failureCount })}</span>{/if}{:else}{t('Gönderim yok')}{/if}
          </span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="rounded-xl border border-dashed bg-card px-4 py-10 text-center text-sm text-muted-foreground"><WebhooksIcon class="mx-auto mb-2 size-8" />{t('Henüz webhook yok.')}</p>
  {/if}
</div>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="w-full gap-0 data-[side=right]:sm:max-w-2xl">
    <Sheet.Header class="border-b">
      <Sheet.Title>{editId ? 'Webhook' : t('Yeni webhook')}</Sheet.Title>
      <Sheet.Description>{t('İstekler POST + JSON olarak gönderilir;')} <code>X-Forum-Signature</code> {t('başlığı ile doğrulanır.')}</Sheet.Description>
    </Sheet.Header>
    <div class="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">
      <div class="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <Field label={t('Ad')} error={errors.name}><Input bind:value={name} maxlength={60} placeholder={t('ör. Discord botu')} /></Field>
        <Field label={t('Adres')} error={errors.url}><Input bind:value={url} placeholder="https://bot.ornek.com/forum-webhook" class="font-mono text-xs" /></Field>
      </div>
      <div class="grid gap-2">
        <span class="text-sm font-semibold">{t('Olaylar')}</span>
        <div class="grid gap-2 sm:grid-cols-2">
          {#each WEBHOOK_EVENTS as e (e)}
            <label class="flex items-start gap-2.5 rounded-md border p-2.5 text-sm">
              <Checkbox checked={events.includes(e)} onCheckedChange={(v) => (events = v === true ? [...new Set([...events, e])] : events.filter((x) => x !== e))} class="mt-0.5" />
              <span class="grid"><code class="text-xs font-semibold">{e}</code><span class="text-xs text-muted-foreground">{t(WEBHOOK_EVENT_INFO[e])}</span></span>
            </label>
          {/each}
        </div>
        {#if errors.events}<p class="text-xs text-destructive">{errors.events}</p>{/if}
      </div>
      <label class="flex items-center justify-between gap-3 text-sm font-semibold">{t('Etkin')} <Switch bind:checked={enabled} /></label>

      {#if editId}
        <div class="grid gap-2 border-t pt-4">
          <div class="flex items-center gap-2">
            <h3 class="flex-1 text-sm font-bold">{t('Son gönderimler')}</h3>
            <Button variant="outline" size="sm" onclick={ping} disabled={pinging}>{#if pinging}<LoaderIcon class="animate-spin" />{:else}<PaperPlaneIcon />{/if}{t('Test gönder')}</Button>
          </div>
          {#if !log}
            <LoaderIcon class="size-4 animate-spin text-muted-foreground" />
          {:else if !log.items.length}
            <p class="text-sm text-muted-foreground">{t('Henüz gönderim yok. "Test gönder" ile bağlantıyı dene.')}</p>
          {:else}
            <div class="grid gap-1">
              {#each log.items as d (d.id)}
                <div class="rounded-md border">
                  <button type="button" class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs" onclick={() => (expanded = expanded === d.id ? null : d.id)}>
                    <span class={cn('size-2 shrink-0 rounded-full', statusColor(d.status))}></span>
                    <code class="font-semibold">{d.event}</code>
                    <span class="text-muted-foreground">{d.responseCode ? `HTTP ${d.responseCode}` : (d.error ?? t('bekliyor'))}</span>
                    {#if d.durationMs !== null}<span class="text-muted-foreground">{d.durationMs} ms</span>{/if}
                    {#if d.attempts > 1}<span class="text-muted-foreground">{t('{n} deneme', { n: d.attempts })}</span>{/if}
                    <span class="ml-auto text-muted-foreground" title={formatDateTime(d.createdAt)}><TimeAgo ms={d.createdAt} /></span>
                  </button>
                  {#if expanded === d.id}
                    <div class="grid gap-2 border-t bg-muted/20 p-3">
                      <pre class="max-h-64 overflow-auto rounded border bg-card p-2 font-mono text-[11px]">{JSON.stringify(d.payload, null, 2)}</pre>
                      {#if d.responseBody}<p class="text-xs"><b>{t('Yanıt:')}</b> <span class="font-mono">{d.responseBody.slice(0, 300)}</span></p>{/if}
                      <Button variant="outline" size="sm" class="justify-self-start" onclick={() => redeliver(d)}><ArrowsClockwiseIcon />{t('Yeniden gönder')}</Button>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
            {#if log.total > log.perPage}
              <div class="flex items-center justify-between text-xs">
                <Button variant="ghost" size="sm" disabled={log.page <= 1} onclick={() => editId && loadLog(editId, log!.page - 1)}>{t('Önceki')}</Button>
                <span class="text-muted-foreground">{log.page} / {Math.ceil(log.total / log.perPage)}</span>
                <Button variant="ghost" size="sm" disabled={log.page * log.perPage >= log.total} onclick={() => editId && loadLog(editId, log!.page + 1)}>{t('Sonraki')}</Button>
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
    <Sheet.Footer class="flex-row flex-wrap justify-between gap-2 border-t">
      <div class="flex gap-2">
        {#if editId}
          <Button variant="outline" size="sm" onclick={rotate}><KeyIcon />{t('İmza anahtarını yenile')}</Button>
          <Button variant="ghost" size="sm" class="text-destructive" onclick={remove}><TrashIcon />{t('Sil')}</Button>
        {/if}
      </div>
      <div class="flex gap-2">
        <Button variant="ghost" onclick={() => (open = false)}>{t('Kapat')}</Button>
        <Button onclick={save} disabled={saving || !name.trim() || !url.trim() || !events.length}>{#if saving}<LoaderIcon class="animate-spin" />{/if}{t('Kaydet')}</Button>
      </div>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>

<SecretDialog
  title={t('Webhook imza anahtarı')}
  bind:items={secrets}
  note={t('Alıcı tarafta: HMAC-SHA256(secret, "<t>.<gövde>") değerini X-Forum-Signature başlığındaki v1 ile karşılaştır.')}
/>
