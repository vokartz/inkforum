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
  import { t, tc } from '$lib/i18n.svelte';

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
  const sel = 'h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground';
</script>

<svelte:head><title>#{ticket.id} {ticket.subject} · {t('Destek')}</title></svelte:head>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]" data-part="ticket-detail">
  <div class="grid min-w-0 content-start gap-4">
    <a href={ticket.canManage ? '/tickets/desk' : '/tickets'} class="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      ><ArrowLeftIcon class="size-4" />{ticket.canManage ? t('Destek masası') : t('Taleplerim')}</a
    >
    <header class="grid gap-2">
      <h1 class="text-2xl font-bold tracking-tight break-words">{ticket.subject}</h1>
      <p class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span class="tabular-nums">#{ticket.id}</span>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold" style="color:{ticket.category.color ?? 'inherit'}">
          {#if ticket.category.iconNodes}<NodeIcon nodes={ticket.category.iconNodes} size={13} />{:else}<LifebuoyIcon class="size-3.5" />{/if}{tc(ticket.category.name)}
        </span>
        <TicketStatusPill status={ticket.status} /><TicketPriority priority={ticket.priority} />
      </p>
    </header>

    <!-- Yazışma -->
    <section class="overflow-hidden rounded-2xl border bg-card">
      <ol>
        {#each ticket.messages as m (m.id)}
          <li
            class={cn(
              'relative flex gap-3 border-b px-5 py-4',
              m.isInternal ? 'bg-warning/5' : m.isStaff && 'bg-primary/[0.035]',
            )}
            data-part="ticket-message"
          >
            {#if m.isStaff || m.isInternal}<span class={cn('absolute inset-y-0 left-0 w-0.5', m.isInternal ? 'bg-warning' : 'bg-primary')} aria-hidden="true"></span>{/if}
            {#if m.user}<UserAvatar user={m.user} size={36} class="shrink-0" />{/if}
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2 leading-tight">
                {#if m.user}<UserName user={m.user} class="text-sm font-semibold" />{/if}
                {#if m.isStaff}<span class="inline-flex items-center gap-1 rounded-md bg-primary-soft px-1.5 py-px text-[11px] font-semibold text-highlight"><ShieldIcon class="size-3" />{t('Yetkili')}</span>{/if}
                {#if m.isInternal}<span class="inline-flex items-center gap-1 rounded-md bg-warning/15 px-1.5 py-px text-[11px] font-semibold text-warning"><LockIcon class="size-3" />{t('İç not')}</span>{/if}
                <span class="text-xs text-muted-foreground" title={formatDateTime(m.createdAt)}><TimeAgo ms={m.createdAt} /></span>
              </p>
              <div class="prose-forum mt-1.5 text-[15px]">{@html m.html}</div>
            </div>
          </li>
        {/each}
      </ol>

      {#if ticket.canReply}
        <form class="grid gap-3 p-4" onsubmit={reply} data-part="ticket-reply">
          <Editor
            bind:value={body}
            compact
            minHeight={110}
            maxLength={20000}
            mentions={false}
            placeholder={ticket.canManage ? t('Üyeye yanıt ya da ekip için iç not…') : t('Yanıtını yaz…')}
            uploadUrl="/api/tickets/images"
          />
          <div class="flex flex-wrap items-center gap-3">
            {#if ticket.canManage}
              <label class="flex items-center gap-2 text-sm"><Switch bind:checked={internal} />{t('İç not')}</label>
              {#if !internal}
                <select bind:value={replyStatus} class="h-9 rounded-lg border bg-background px-2 text-sm" aria-label={t('Yanıttan sonra durum')}>
                  <option value="">{t('Durum: Yanıtlandı')}</option>
                  <option value="on_hold">{t('Durum: Beklemede')}</option>
                  <option value="closed">{t('Yanıtla ve kapat')}</option>
                </select>
              {/if}
            {/if}
            <Button type="submit" class="ml-auto" disabled={sending || !body.trim()}
              >{#if sending}<LoaderIcon class="animate-spin" />{:else}<PaperPlaneIcon />{/if}{internal ? t('Not ekle') : t('Gönder')}</Button
            >
          </div>
        </form>
      {:else if ticket.status === 'closed'}
        <p class="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
          <CheckCircleIcon class="size-5" />{t('Bu talep kapatıldı.')}{#if ticket.canReopen}
            {t('Sorun devam ediyorsa yeniden açabilirsin.')}{/if}
        </p>
      {/if}
    </section>
  </div>

  <aside class="grid content-start gap-3 lg:sticky lg:top-24">
    <section class="grid gap-4 rounded-2xl border bg-card p-4 text-sm">
      {#if ticket.user}
        <div class="flex items-center gap-2.5">
          <UserAvatar user={ticket.user} size={36} />
          <div class="min-w-0"><UserName user={ticket.user} class="font-semibold" /><p class="text-xs text-muted-foreground">{t('Talep sahibi')}</p></div>
        </div>
      {/if}
      <dl class="grid gap-2.5">
        <div class="flex justify-between gap-2"><dt class="text-muted-foreground">{t('Açılış')}</dt><dd class="text-right">{formatDateTime(ticket.createdAt)}</dd></div>
        <div class="flex justify-between gap-2"><dt class="text-muted-foreground">{t('Sorumlu')}</dt><dd class="truncate text-right">{ticket.assignee?.displayName ?? t('Atanmadı')}</dd></div>
        {#if ticket.closedAt}<div class="flex justify-between gap-2"><dt class="text-muted-foreground">{t('Kapanış')}</dt><dd class="text-right">{formatDateTime(ticket.closedAt)}</dd></div>{/if}
      </dl>

      {#if ticket.canManage}
        <div class="grid gap-3 border-t pt-4">
          <p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('Talebi yönet')}</p>
          <label class="grid gap-1 text-xs font-medium text-muted-foreground"
            >{t('Durum')}
            <select class={sel} value={ticket.status} onchange={(e) => update({ status: (e.currentTarget as HTMLSelectElement).value as TicketStatus }, t('Durum güncellendi.'))}>
              {#each TICKET_STATUSES as st (st)}<option value={st}>{t(TICKET_STATUS_LABELS[st])}</option>{/each}
            </select>
          </label>
          <label class="grid gap-1 text-xs font-medium text-muted-foreground"
            >{t('Öncelik')}
            <select class={sel} value={ticket.priority} onchange={(e) => update({ priority: (e.currentTarget as HTMLSelectElement).value as never }, t('Öncelik güncellendi.'))}>
              {#each TICKET_PRIORITIES as pr (pr)}<option value={pr}>{t(TICKET_PRIORITY_LABELS[pr])}</option>{/each}
            </select>
          </label>
          <label class="grid gap-1 text-xs font-medium text-muted-foreground"
            >{t('Sorumlu yetkili')}
            <select
              class={sel}
              value={ticket.assignee?.id ?? ''}
              onchange={(e) => {
                const v = (e.currentTarget as HTMLSelectElement).value;
                update({ assigneeId: v ? Number(v) : null }, t('Sorumlu güncellendi.'));
              }}
            >
              <option value="">{t('— Atanmadı —')}</option>
              {#each ticket.staff as st (st.id)}<option value={st.id}>{st.displayName}{st.id === data.viewer.user?.id ? ` ${t('(ben)')}` : ''}</option>{/each}
            </select>
          </label>
          <label class="grid gap-1 text-xs font-medium text-muted-foreground"
            >{t('Kategori')}
            <select class={sel} value={ticket.category.id} onchange={(e) => update({ categoryId: Number((e.currentTarget as HTMLSelectElement).value) }, t('Kategori değişti.'))}>
              {#each ticket.categories as ct (ct.id)}<option value={ct.id}>{tc(ct.name)}</option>{/each}
            </select>
          </label>
        </div>
      {/if}
    </section>
    {#if ticket.canClose && !ticket.canManage}<Button variant="outline" onclick={() => update({ status: 'closed' }, t('Talep kapatıldı.'))}><CheckCircleIcon />{t('Sorunum çözüldü, kapat')}</Button>{/if}
    {#if ticket.canReopen}<Button variant="outline" onclick={() => update({ status: 'open' }, t('Talep yeniden açıldı.'))}><ArrowCounterIcon />{t('Yeniden aç')}</Button>{/if}
  </aside>
</div>
