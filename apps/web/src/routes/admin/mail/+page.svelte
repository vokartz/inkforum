<script lang="ts">
  import { MAIL_COMMON_VARS, type AdminMailTemplate } from '@forum/shared';
  import { untrack } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/Envelope';
  import UserIcon from 'phosphor-svelte/lib/UserCircle';
  import BellIcon from 'phosphor-svelte/lib/Bell';
  import PaperPlaneIcon from 'phosphor-svelte/lib/PaperPlaneTilt';
  import ArrowCounterIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
  import FloppyIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import Field from '$lib/components/Field.svelte';
  import CodeEditor from '$lib/components/CodeEditor.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { createForm } from '$lib/form.svelte';
  import { formatDateTime } from '$lib/format';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';
  import TransportCard from './TransportCard.svelte';

  let { data } = $props();
  let tab = $state('templates');

  // ---------- Şablonlar ----------
  let selectedKey = $state(untrack(() => data.templates[0]?.key ?? ''));
  const selected = $derived(data.templates.find((t) => t.key === selectedKey) ?? null);
  let subject = $state('');
  let body = $state('');
  let snapshot = $state('');
  function fill(t: AdminMailTemplate | null | undefined) {
    subject = t?.subject ?? '';
    body = t?.body ?? '';
    snapshot = `${subject}\n${body}`;
  }
  // İlk çizimde (sunucuda da) dolu gelsin; kaydetme sonrası yeni veriyle yeniden doldurulur.
  fill(untrack(() => selected));
  let lastData = untrack(() => data.templates);
  $effect(() => {
    const list = data.templates;
    if (list === lastData) return;
    lastData = list;
    untrack(() => fill(list.find((t) => t.key === selectedKey)));
  });
  const dirty = $derived(`${subject}\n${body}` !== snapshot);

  let preview = $state<{ subject: string; html: string } | null>(null);
  let previewError = $state<string | null>(null);
  $effect(() => {
    const key = selectedKey;
    const s = subject;
    const b = body;
    if (!key || !s.trim() || !b.trim()) return;
    const t = setTimeout(async () => {
      try {
        preview = await api.post<{ subject: string; html: string }>(`/api/admin/mail/templates/${key}/preview`, { subject: s, body: b });
        previewError = null;
      } catch (e) {
        previewError = e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : errorMessage(e);
      }
    }, 350);
    return () => clearTimeout(t);
  });

  let saving = $state(false);
  async function save() {
    if (!selected) return;
    saving = true;
    try {
      await api.put(`/api/admin/mail/templates/${selected.key}`, { subject, body });
      toast.success(t('Şablon kaydedildi.'));
      await invalidate('app:admin-mail');
    } catch (e) {
      toast.error(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : errorMessage(e));
    } finally {
      saving = false;
    }
  }
  async function reset() {
    if (!selected) return;
    if (!(await confirmAction({ title: t('Varsayılana dönülsün mü?'), description: t('Bu şablondaki değişiklikler silinir.'), confirmLabel: t('Varsayılana dön'), destructive: true }))) return;
    await api.delete(`/api/admin/mail/templates/${selected.key}`);
    toast.success(t('Şablon varsayılana döndü.'));
    await invalidate('app:admin-mail');
  }
  let testing = $state(false);
  async function sendTest() {
    if (!selected || !data.viewer.user) return;
    testing = true;
    try {
      await api.post(`/api/admin/mail/templates/${selected.key}/preview`, { subject, body, to: data.viewer.user.email });
      toast.success(t('Örnek e-posta {email} adresine gönderildi.', { email: data.viewer.user.email }));
      await invalidate('app:admin-mail');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      testing = false;
    }
  }
  async function copyVar(k: string) {
    try {
      await navigator.clipboard.writeText(`{{${k}}}`);
      toast.success(t('{name} kopyalandı.', { name: `{{${k}}}` }));
    } catch {
      /* pano yok */
    }
  }
  function choose(key: AdminMailTemplate['key']) {
    if (key === selectedKey) return;
    if (dirty && !confirm(t('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?'))) return;
    selectedKey = key;
    fill(data.templates.find((t) => t.key === key));
  }
  const groups: Array<{ id: AdminMailTemplate['group']; label: string; icon: typeof UserIcon }> = [
    { id: 'account', label: 'Hesap', icon: UserIcon },
    { id: 'notification', label: 'Bildirimler', icon: BellIcon },
  ];

  // ---------- Gönderim testi ----------
  let to = $state(untrack(() => data.viewer.user?.email ?? ''));
  const form = createForm();
  const driverLabels: Record<string, string> = {
    log: 'Günlük (e-postalar gönderilmez, storage/mail klasörüne yazılır)',
    smtp: 'SMTP',
    sendmail: 'Sendmail (sunucunun yerel e-posta programı)',
  };
  async function send(e: SubmitEvent) {
    e.preventDefault();
    const res = await form.submit(() => api.post('/api/admin/mail/test', { to }), { success: t('Test e-postası gönderildi; gelen kutusunu (ve spam klasörünü) kontrol edin.') });
    if (res) await invalidate('app:admin-mail');
  }
</script>

<svelte:head><title>{t('E-posta · Yönetim')}</title></svelte:head>

<PageHeader
  icon={PageHeaderIcon}
  title={t('E-posta')}
  description={t('Üyelere giden e-postaların içeriğini düzenle ve gönderimi test et. Gönderen adı ve adresi Ayarlar → E-posta bölümünde.')}
/>

{#if data.outbox}
  <Tabs.Root bind:value={tab}>
    <Tabs.List class="mb-4">
      <Tabs.Trigger value="templates">{t('Şablonlar')}</Tabs.Trigger>
      <Tabs.Trigger value="delivery">{t('Gönderim (SMTP) ve test')}</Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="templates">
      <div class="grid gap-5 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <nav class="grid content-start gap-4" aria-label={t('Şablonlar')}>
          {#each groups as g (g.id)}
            <div class="grid gap-1">
              <p class="flex items-center gap-1.5 px-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase"><g.icon class="size-3.5" />{t(g.label)}</p>
              {#each data.templates.filter((tpl) => tpl.group === g.id) as tpl (tpl.key)}
                <button
                  type="button"
                  onclick={() => choose(tpl.key)}
                  class={cn('flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors', tpl.key === selectedKey ? 'bg-primary-soft font-semibold text-highlight' : 'hover:bg-accent')}
                >
                  <span class="min-w-0 flex-1 truncate">{t(tpl.label)}</span>
                  {#if tpl.isCustom}<span class="rounded bg-primary-soft px-1.5 text-[10px] font-bold text-highlight">{t('Düzenlendi')}</span>{/if}
                </button>
              {/each}
            </div>
          {/each}
        </nav>

        {#if selected}
          <div class="grid min-w-0 gap-4">
            <div class="flex flex-wrap items-center gap-2">
              <div class="min-w-0 flex-1">
                <h2 class="text-lg font-bold">{t(selected.label)}</h2>
                <p class="text-sm text-muted-foreground">{t(selected.description)}</p>
              </div>
              {#if selected.isCustom}<Button variant="ghost" onclick={reset}><ArrowCounterIcon />{t('Varsayılana dön')}</Button>{/if}
              <Button variant="outline" onclick={sendTest} disabled={testing}>{#if testing}<LoaderIcon class="animate-spin" />{:else}<PaperPlaneIcon />{/if}{t('Bana örnek gönder')}</Button>
              <Button onclick={save} disabled={saving || !dirty}>{#if saving}<LoaderIcon class="animate-spin" />{:else}<FloppyIcon />{/if}{t('Kaydet')}</Button>
            </div>

            <div class="grid gap-4 2xl:grid-cols-2">
              <div class="grid content-start gap-4">
                <Field label={t('Konu')}><Input bind:value={subject} maxlength={200} /></Field>
                <Field label={t('İçerik (HTML)')} hint={t('<a class="button" href="{{url}}">…</a> düğme, <p class="muted"> soluk yazı olarak biçimlenir.')}>
                  <CodeEditor bind:value={body} minHeight={320} maxLength={50000} />
                </Field>
                <div class="rounded-lg border bg-muted/20 p-3">
                  <p class="mb-2 text-xs font-bold text-muted-foreground">{t('Değişkenler (tıkla, kopyala)')}</p>
                  <div class="flex flex-wrap gap-1.5">
                    {#each [...MAIL_COMMON_VARS, ...selected.vars] as v (v.key)}
                      <button type="button" class="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 font-mono text-xs hover:border-primary" title={t(v.label)} onclick={() => copyVar(v.key)}>
                        {`{{${v.key}}}`}<CopyIcon class="size-3 text-muted-foreground" />
                      </button>
                    {/each}
                  </div>
                </div>
              </div>
              <div class="grid content-start gap-2">
                <p class="text-sm font-semibold">{t('Önizleme')} <span class="font-normal text-muted-foreground">{t('(örnek değerlerle)')}</span></p>
                {#if previewError}<p class="text-xs text-destructive">{previewError}</p>{/if}
                {#if preview}
                  <div class="overflow-hidden rounded-lg border bg-white">
                    <div class="border-b bg-zinc-50 px-3 py-2 text-xs text-zinc-600"><b>{t('Konu:')}</b> {preview.subject}</div>
                    <iframe title={t('E-posta önizlemesi')} srcdoc={preview.html} sandbox="" class="h-[30rem] w-full bg-white"></iframe>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </Tabs.Content>

    <Tabs.Content value="delivery">
      <div class="grid max-w-4xl gap-6">
        {#if data.transport}{#key data.transport}<TransportCard transport={data.transport} />{/key}{/if}
        <Card.Root>
          <Card.Header>
            <Card.Title class="text-base">{t('Test e-postası')}</Card.Title>
            <Card.Description>{t('Kayıtlı ayarlarla gerçek bir e-posta gönderir. Etkin sürücü: {driver}.', { driver: driverLabels[data.outbox.driver] ? t(driverLabels[data.outbox.driver]!) : data.outbox.driver })}</Card.Description>
          </Card.Header>
          <Card.Content>
            <form class="flex flex-wrap gap-2" onsubmit={send}>
              <Input type="email" bind:value={to} class="w-72" required />
              <Button type="submit" disabled={form.submitting}>{t('Gönder')}</Button>
            </form>
            <FormMessage message={form.error('to') ?? form.message} class="mt-3" />
          </Card.Content>
        </Card.Root>

        {#if data.outbox.driver === 'log'}
          <Card.Root>
            <Card.Header><Card.Title class="text-base">{t('Son e-postalar (bu oturumda)')}</Card.Title></Card.Header>
            <Card.Content class="grid gap-2">
              {#each data.outbox.items as m, i (i)}
                <details class="rounded-lg border p-2 text-sm">
                  <summary class="cursor-pointer">
                    <span class="font-medium">{m.subject}</span>
                    <span class="text-xs text-muted-foreground"> → {m.to} · {formatDateTime(m.sentAt)}</span>
                  </summary>
                  <pre class="mt-2 text-xs whitespace-pre-wrap">{m.text}</pre>
                </details>
              {:else}
                <p class="text-sm text-muted-foreground">{t('Henüz e-posta yok.')}</p>
              {/each}
            </Card.Content>
          </Card.Root>
        {/if}
      </div>
    </Tabs.Content>
  </Tabs.Root>
{/if}
