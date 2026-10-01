<script lang="ts">
  import { TICKET_PRIORITIES, TICKET_PRIORITY_LABELS, TICKET_STATUSES, TICKET_STATUS_LABELS, type TicketStatus, type TicketUpdateInput } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import LifebuoyIcon from 'phosphor-svelte/lib/Lifebuoy';
  import LockIcon from 'phosphor-svelte/lib/LockSimple';
  import PaperPlaneIcon from 'phosphor-svelte/lib/PaperPlaneRight';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import ArrowCounterIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
  import ShieldIcon from 'phosphor-svelte/lib/ShieldCheck';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import Editor from '$lib/components/editor/Editor.svelte';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import TicketStatusPill from '$lib/components/tickets/TicketStatus.svelte';
  import TicketPriority from '$lib/components/tickets/TicketPriority.svelte';
  import { api, errorMessage } from '$lib/api';
  import { formatDateTime } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const ticket = $derived(data.ticket);

  let body = $state('');
  let internal = $state(false);
  let replyStatus = $state<TicketStatus | ''>('');
  let sending = $state(false);
  async function reply(e: SubmitEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    sending = true;
    try {
      await api.post(`/api/tickets/${ticket.id}/messages`, { body, internal: ticket.canManage && internal, ...(ticket.canManage && replyStatus && !internal ? { status: replyStatus } : {}) });
      body = '';
      replyStatus = '';
      await invalidate('app:ticket');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      sending = false;
    }
  }
  async function update(patch: TicketUpdateInput, msg?: string) {
    try {
      await api.patch(`/api/tickets/${ticket.id}`, patch);
      if (msg) toast.success(msg);
      await invalidate('app:ticket');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }
  const sel = 'h-9 w-full rounded-md border bg-background px-2 text-sm';
</script>

<svelte:head><title>#{ticket.id} {ticket.subject} · {t('Destek')}</title></svelte:head>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]" data-part="ticket-detail">
  <div class="grid min-w-0 content-start gap-5">
    <a href={ticket.canManage ? '/tickets/desk' : '/tickets'} class="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon class="size-4" />{ticket.canManage ? t('Destek masası') : t('Taleplerim')}</a>
    <header class="flex flex-wrap items-start gap-3">
      <span class="flex size-11 shrink-0 items-center justify-center rounded-xl" style="background:color-mix(in oklch, {ticket.category.color ?? 'var(--primary)'} 15%, transparent);color:{ticket.category.color ?? 'var(--primary)'}">
        {#if ticket.category.iconNodes}<NodeIcon nodes={ticket.category.iconNodes} size={22} />{:else}<LifebuoyIcon class="size-5" />{/if}
      </span>
      <div class="min-w-0 flex-1">
        <h1 class="text-xl font-extrabold tracking-tight sm:text-2xl">{ticket.subject}</h1>
        <p class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">#{ticket.id} · {ticket.category.name} · <TicketStatusPill status={ticket.status} /><TicketPriority priority={ticket.priority} /></p>
      </div>
    </header>

    <!-- Konuşma -->
    <ol class="grid gap-3">
      {#each ticket.messages as m (m.id)}
        <li class={cn('rounded-2xl border p-4 sm:p-5', m.isInternal ? 'border-dashed border-warning/50 bg-warning/5' : m.isStaff ? 'border-primary/30 bg-primary-soft' : 'bg-card')}>
          <div class="mb-2 flex flex-wrap items-center gap-2 text-sm">
            {#if m.user}<UserAvatar user={m.user} size={30} /><UserName user={m.user} class="font-bold" />{/if}
            {#if m.isStaff}<span class="inline-flex items-center gap-1 rounded bg-primary px-1.5 text-[11px] font-bold text-primary-foreground"><ShieldIcon class="size-3" />{t('Yetkili')}</span>{/if}
            {#if m.isInternal}<span class="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 text-[11px] font-bold text-warning"><LockIcon class="size-3" />{t('İç not')}</span>{/if}
            <span class="ml-auto text-xs text-muted-foreground" title={formatDateTime(m.createdAt)}><TimeAgo ms={m.createdAt} /></span>
          </div>
          <div class="prose-forum text-[15px]">{@html m.html}</div>
        </li>
      {/each}
    </ol>

    {#if ticket.canReply}
      <form class="grid gap-3 rounded-2xl border bg-card p-4" onsubmit={reply}>
        <Editor bind:value={body} minHeight={140} maxLength={20000} mentions={false} placeholder={ticket.canManage ? t('Üyeye yanıt ya da ekip için iç not…') : t('Yanıtını yaz…')} uploadUrl="/api/tickets/images" />
        <div class="flex flex-wrap items-center gap-3">
          {#if ticket.canManage}
            <label class="flex items-center gap-2 text-sm"><Switch bind:checked={internal} />{t('İç not')}</label>
            {#if !internal}
              <select bind:value={replyStatus} class="h-9 rounded-md border bg-background px-2 text-sm" aria-label={t('Yanıttan sonra durum')}>
                <option value="">{t('Durum: Yanıtlandı')}</option>
                <option value="on_hold">{t('Durum: Beklemede')}</option>
                <option value="closed">{t('Yanıtla ve kapat')}</option>
              </select>
            {/if}
          {/if}
          <Button type="submit" class="ml-auto" disabled={sending || !body.trim()}>{#if sending}<LoaderIcon class="animate-spin" />{:else}<PaperPlaneIcon />{/if}{internal ? t('Not ekle') : t('Gönder')}</Button>
        </div>
      </form>
    {:else if ticket.status === 'closed'}
      <p class="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"><CheckCircleIcon class="size-5" />{t('Bu talep kapatıldı.')}{#if ticket.canReopen} {t('Sorun devam ediyorsa yeniden açabilirsin.')}{/if}</p>
    {/if}
  </div>

  <aside class="grid content-start gap-3 lg:sticky lg:top-24">
    <section class="grid gap-3 rounded-2xl border bg-card p-4 text-sm">
      {#if ticket.user}
        <div class="flex items-center gap-2.5"><UserAvatar user={ticket.user} size={36} /><div class="min-w-0"><UserName user={ticket.user} class="font-bold" /><p class="text-xs text-muted-foreground">{t('Talep sahibi')}</p></div></div>
      {/if}
      <dl class="grid gap-2 border-t pt-3">
        <div class="flex justify-between gap-2"><dt class="text-muted-foreground">{t('Açılış')}</dt><dd>{formatDateTime(ticket.createdAt)}</dd></div>
        <div class="flex justify-between gap-2"><dt class="text-muted-foreground">{t('Sorumlu')}</dt><dd class="truncate">{ticket.assignee?.displayName ?? t('Atanmadı')}</dd></div>
        {#if ticket.closedAt}<div class="flex justify-between gap-2"><dt class="text-muted-foreground">{t('Kapanış')}</dt><dd>{formatDateTime(ticket.closedAt)}</dd></div>{/if}
      </dl>
    </section>

    {#if ticket.canManage}
      <section class="grid gap-3 rounded-2xl border bg-card p-4">
        <p class="text-sm font-bold">{t('Talebi yönet')}</p>
        <label class="grid gap-1 text-xs font-semibold text-muted-foreground">{t('Durum')}
          <select class={sel} value={ticket.status} onchange={(e) => update({ status: (e.currentTarget as HTMLSelectElement).value as TicketStatus }, t('Durum güncellendi.'))}>
            {#each TICKET_STATUSES as s (s)}<option value={s}>{t(TICKET_STATUS_LABELS[s])}</option>{/each}
          </select>
        </label>
        <label class="grid gap-1 text-xs font-semibold text-muted-foreground">{t('Öncelik')}
          <select class={sel} value={ticket.priority} onchange={(e) => update({ priority: (e.currentTarget as HTMLSelectElement).value as never }, t('Öncelik güncellendi.'))}>
            {#each TICKET_PRIORITIES as p (p)}<option value={p}>{t(TICKET_PRIORITY_LABELS[p])}</option>{/each}
          </select>
        </label>
        <label class="grid gap-1 text-xs font-semibold text-muted-foreground">{t('Sorumlu yetkili')}
          <select class={sel} value={ticket.assignee?.id ?? ''} onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; update({ assigneeId: v ? Number(v) : null }, t('Sorumlu güncellendi.')); }}>
            <option value="">{t('— Atanmadı —')}</option>
            {#each ticket.staff as s (s.id)}<option value={s.id}>{s.displayName}{s.id === data.viewer.user?.id ? ` ${t('(ben)')}` : ''}</option>{/each}
          </select>
        </label>
        <label class="grid gap-1 text-xs font-semibold text-muted-foreground">{t('Kategori')}
          <select class={sel} value={ticket.category.id} onchange={(e) => update({ categoryId: Number((e.currentTarget as HTMLSelectElement).value) }, t('Kategori değişti.'))}>
            {#each ticket.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </select>
        </label>
      </section>
    {/if}
    {#if ticket.canClose && !ticket.canManage}<Button variant="outline" onclick={() => update({ status: 'closed' }, t('Talep kapatıldı.'))}><CheckCircleIcon />{t('Sorunum çözüldü, kapat')}</Button>{/if}
    {#if ticket.canReopen}<Button variant="outline" onclick={() => update({ status: 'open' }, t('Talep yeniden açıldı.'))}><ArrowCounterIcon />{t('Yeniden aç')}</Button>{/if}
  </aside>
</div>
