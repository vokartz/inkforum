<script lang="ts">
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import XIcon from 'phosphor-svelte/lib/X';
  import HandIcon from 'phosphor-svelte/lib/HandGrabbing';
  import LockIcon from 'phosphor-svelte/lib/LockSimple';
  import PaperPlaneIcon from 'phosphor-svelte/lib/PaperPlaneRight';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import ClipboardIcon from 'phosphor-svelte/lib/ClipboardText';
  import ArrowUUpLeftIcon from 'phosphor-svelte/lib/ArrowUUpLeft';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import StatusPill from '$lib/components/applications/StatusPill.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDate, formatDateTime, formatNumber } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const a = $derived(data.app);
  const open = $derived(a.status === 'pending' || a.status === 'reviewing');

  let note = $state('');
  let internal = $state(false);
  let sending = $state(false);
  async function addNote(e: SubmitEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    sending = true;
    try {
      await api.post(`/api/applications/${a.id}/notes`, { body: note, internal: a.canReview && internal });
      note = '';
      await invalidate('app:application');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      sending = false;
    }
  }

  async function act(path: string, body?: unknown, success?: string) {
    try {
      await api.post(`/api/applications/${a.id}/${path}`, body);
      if (success) toast.success(success);
      await invalidate('app:application');
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  }

  let decideOpen = $state(false);
  let decision = $state<'approve' | 'reject'>('approve');
  let reason = $state('');
  let deciding = $state(false);
  function openDecide(d: 'approve' | 'reject') {
    decision = d;
    reason = '';
    decideOpen = true;
  }
  async function decide() {
    deciding = true;
    if (await act('decide', { decision, reason }, decision === 'approve' ? t('Başvuru onaylandı.') : t('Başvuru reddedildi.'))) decideOpen = false;
    deciding = false;
  }
  async function withdraw() {
    if (await confirmAction({ title: t('Başvuru geri çekilsin mi?'), description: t('Başvurun iptal edilir; yeniden başvurabilirsin.'), confirmLabel: t('Geri çek'), destructive: true })) await act('withdraw', undefined, t('Başvuru geri çekildi.'));
  }

  const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? t('Evet') : t('Hayır')) : Array.isArray(v) ? v.join(', ') : String(v));
</script>

<svelte:head><title>{t('Başvuru #{id}', { id: a.id })} · {a.form.title}</title></svelte:head>

<div class="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]" data-part="application-detail">
  <div class="grid min-w-0 content-start gap-5">
    <a href={a.canReview ? '/applications/review' : '/applications'} class="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon class="size-4" />{a.canReview ? t('İnceleme kuyruğu') : t('Başvurular')}</a>

    <header class="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5">
      <span class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">{#if a.form.iconNodes}<NodeIcon nodes={a.form.iconNodes} size={24} />{:else}<ClipboardIcon class="size-6" weight="duotone" />{/if}</span>
      <div class="min-w-0 flex-1">
        <h1 class="text-xl font-extrabold tracking-tight"><a href="/applications/{a.form.slug}" class="hover:underline">{a.form.title}</a> <span class="text-muted-foreground">#{a.id}</span></h1>
        <p class="text-sm text-muted-foreground">{t('{date} tarihinde gönderildi', { date: formatDateTime(a.createdAt) })}</p>
      </div>
      <StatusPill status={a.status} class="text-sm" />
    </header>

    {#if a.decidedAt}
      <div class={cn('rounded-xl border p-4', a.status === 'approved' ? 'border-success/40 bg-success/10' : 'border-destructive/40 bg-destructive/10')}>
        <p class="font-bold">{a.status === 'approved' ? t('Başvuru onaylandı') : t('Başvuru reddedildi')}{#if a.decidedBy} · <span class="font-normal">{a.decidedBy.displayName}</span>{/if}</p>
        {#if a.decisionReason}<p class="mt-1 text-sm whitespace-pre-line">{a.decisionReason}</p>{/if}
      </div>
    {/if}

    <!-- Yanıtlar -->
    <section class="divide-y overflow-hidden rounded-2xl border bg-card">
      {#each a.answers as ans, i (ans.question.id)}
        <div class="grid gap-1 px-5 py-4">
          <p class="text-xs font-bold text-muted-foreground">{i + 1}. {ans.question.label}</p>
          <p class={cn('text-[15px] whitespace-pre-wrap', ans.value === null && 'text-muted-foreground')}>{show(ans.value)}</p>
        </div>
      {/each}
    </section>

    <!-- Notlar -->
    <section class="grid gap-3">
      <h2 class="font-bold">{t('Mesajlar')}</h2>
      {#each a.notes as n (n.id)}
        <div class={cn('flex gap-3 rounded-xl border p-4', n.isInternal ? 'border-dashed border-warning/50 bg-warning/5' : 'bg-card')}>
          {#if n.user}<UserAvatar user={n.user} size={36} />{/if}
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 text-sm">
              {#if n.user}<UserName user={n.user} class="font-bold" />{/if}
              <span class="text-xs text-muted-foreground"><TimeAgo ms={n.createdAt} /></span>
              {#if n.isInternal}<span class="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 text-[11px] font-bold text-warning"><LockIcon class="size-3" />{t('İç not')}</span>{/if}
            </p>
            <p class="mt-1 text-sm whitespace-pre-wrap">{n.body}</p>
          </div>
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">{t('Henüz mesaj yok.')}</p>
      {/each}
      {#if open || a.canReview}
        <form class="grid gap-2 rounded-xl border bg-card p-3" onsubmit={addNote}>
          <Textarea bind:value={note} rows={3} maxlength={4000} placeholder={a.canReview ? t('Başvurana yanıt ya da ekip için iç not…') : t('İnceleme ekibine mesaj yaz…')} />
          <div class="flex items-center gap-3">
            {#if a.canReview}<label class="flex items-center gap-2 text-sm"><Switch bind:checked={internal} />{t('İç not (başvuran görmez)')}</label>{/if}
            <Button type="submit" size="sm" class="ml-auto" disabled={sending || !note.trim()}>{#if sending}<LoaderIcon class="animate-spin" />{:else}<PaperPlaneIcon />{/if}{t('Gönder')}</Button>
          </div>
        </form>
      {/if}
    </section>
  </div>

  <aside class="grid content-start gap-3 lg:sticky lg:top-24">
    <section class="grid gap-3 rounded-2xl border bg-card p-4">
      {#if a.user}
        <div class="flex items-center gap-3">
          <UserAvatar user={a.user} size={44} />
          <div class="min-w-0"><UserName user={a.user} class="font-bold" /><p class="text-xs text-muted-foreground">{t('Başvuran')}</p></div>
        </div>
      {/if}
      {#if a.applicant}
        <dl class="grid grid-cols-2 gap-2 text-xs">
          <div class="rounded-lg bg-muted/50 p-2"><dt class="text-muted-foreground">{t('Mesaj')}</dt><dd class="font-bold">{formatNumber(a.applicant.postCount)}</dd></div>
          <div class="rounded-lg bg-muted/50 p-2"><dt class="text-muted-foreground">{t('Uyarı puanı')}</dt><dd class="font-bold">{a.applicant.warningPoints}</dd></div>
          <div class="col-span-2 rounded-lg bg-muted/50 p-2"><dt class="text-muted-foreground">{t('Kayıt')}</dt><dd class="font-bold">{formatDate(a.applicant.registeredAt)}{a.applicant.emailVerified ? '' : ` · ${t('e-posta doğrulanmamış')}`}</dd></div>
        </dl>
      {/if}
      {#if a.reviewer}<p class="text-xs text-muted-foreground">{t('İnceleyen:')} <b class="text-foreground">{a.reviewer.displayName}</b></p>{/if}
    </section>

    {#if a.canReview && open}
      <section class="grid gap-2 rounded-2xl border bg-card p-4">
        <p class="text-sm font-bold">{t('İnceleme')}</p>
        {#if a.status === 'pending'}<Button variant="outline" onclick={() => act('claim', undefined, t('Başvuru üstlenildi.'))}><HandIcon />{t('Üstlen')}</Button>{/if}
        <Button class="bg-success text-white hover:bg-success/90" onclick={() => openDecide('approve')}><CheckIcon weight="bold" />{t('Onayla')}</Button>
        <Button variant="outline" class="text-destructive" onclick={() => openDecide('reject')}><XIcon weight="bold" />{t('Reddet')}</Button>
      </section>
    {/if}
    {#if a.canWithdraw}<Button variant="ghost" class="text-destructive" onclick={withdraw}><ArrowUUpLeftIcon />{t('Başvuruyu geri çek')}</Button>{/if}
  </aside>
</div>

<Dialog.Root bind:open={decideOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{decision === 'approve' ? t('Başvuruyu onayla') : t('Başvuruyu reddet')}</Dialog.Title>
      <Dialog.Description>{decision === 'approve' ? t('Üye bilgilendirilir; form bir gruba bağlıysa o gruba eklenir.') : t('Üye bilgilendirilir; bekleme süresinden sonra yeniden başvurabilir.')}</Dialog.Description>
    </Dialog.Header>
    <Textarea bind:value={reason} rows={4} maxlength={2000} placeholder={t('Başvurana iletilecek not (boşsa formun hazır mesajı kullanılır)')} />
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (decideOpen = false)}>{t('Vazgeç')}</Button>
      <Button onclick={decide} disabled={deciding} class={decision === 'approve' ? 'bg-success text-white hover:bg-success/90' : 'bg-destructive text-white hover:bg-destructive/90'}>
        {#if deciding}<LoaderIcon class="animate-spin" />{/if}{decision === 'approve' ? t('Onayla') : t('Reddet')}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
