<script lang="ts">
  import LifebuoyIcon from 'phosphor-svelte/lib/Lifebuoy';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import TrayIcon from 'phosphor-svelte/lib/Tray';
  import ChatsIcon from 'phosphor-svelte/lib/ChatsCircle';
  import { Button } from '$lib/components/ui/button';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import TicketStatus from '$lib/components/tickets/TicketStatus.svelte';
  import TicketPriority from '$lib/components/tickets/TicketPriority.svelte';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  let tab = $state<'active' | 'closed'>('active');
  const active = $derived(data.items.filter((x) => x.status !== 'closed'));
  const closed = $derived(data.items.filter((x) => x.status === 'closed'));
  const answered = $derived(active.filter((x) => x.status === 'answered').length);
  const shown = $derived(tab === 'closed' ? closed : active);
</script>

<svelte:head><title>{t('Destek')} · {data.viewer.settings['general.forumName']}</title></svelte:head>

<div class="grid gap-6" data-part="tickets">
  <header class="flex flex-wrap items-end gap-4">
    <div class="min-w-0 flex-1">
      <h1 class="text-2xl font-bold tracking-tight" data-part="page-title">{t('Destek')}</h1>
      <p class="mt-1 text-sm text-muted-foreground">{t('Bir sorunun mu var? Talep aç, ekibimiz en kısa sürede yanıtlasın.')}</p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if data.counts.desk !== null}
        <Button href="/tickets/desk" variant="outline"
          ><TrayIcon />{t('Destek masası')}{#if data.counts.desk}<span class="rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{data.counts.desk}</span>{/if}</Button
        >
      {/if}
      <Button href="/tickets/new"><PlusIcon weight="bold" />{t('Yeni talep')}</Button>
    </div>
  </header>

  {#if data.items.length}
    <dl class="grid grid-cols-3 gap-3">
      {#each [{ l: t('Açık'), v: active.length }, { l: t('Yeni yanıt'), v: answered, hi: answered > 0 }, { l: t('Kapalı'), v: closed.length }] as s (s.l)}
        <div class="rounded-xl border bg-card px-4 py-3">
          <dt class="text-xs font-medium text-muted-foreground">{s.l}</dt>
          <dd class={cn('mt-0.5 text-xl font-bold tabular-nums', s.hi && 'text-success')}>{s.v}</dd>
        </div>
      {/each}
    </dl>
  {/if}

  <section class="overflow-hidden rounded-2xl border bg-card" data-part="ticket-list">
    <div class="flex items-center gap-5 border-b px-5" role="tablist">
      {#each [{ v: 'active', l: t('Açık'), n: active.length }, { v: 'closed', l: t('Kapalı'), n: closed.length }] as o (o.v)}
        <button
          type="button"
          role="tab"
          aria-selected={tab === o.v}
          class={cn('-mb-px border-b-2 py-3 text-sm font-semibold transition-colors', tab === o.v ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
          onclick={() => (tab = o.v as typeof tab)}>{o.l} <span class="ml-1 text-xs text-muted-foreground tabular-nums">{o.n}</span></button
        >
      {/each}
    </div>
    {#each shown as ticket (ticket.id)}
      <a href="/tickets/{ticket.id}" class="flex items-center gap-3.5 border-b px-5 py-3.5 transition-colors last:border-0 hover:bg-row-hover">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted" style="color:{ticket.category.color ?? 'var(--primary)'}">
          {#if ticket.category.iconNodes}<NodeIcon nodes={ticket.category.iconNodes} size={18} />{:else}<LifebuoyIcon class="size-4" />{/if}
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2">
            <span class={cn('truncate text-[15px]', ticket.status === 'answered' ? 'font-bold' : 'font-medium')}>{ticket.subject}</span>
            {#if ticket.status === 'answered'}<span class="size-2 shrink-0 rounded-full bg-success" title={t('Yeni yanıt')}></span>{/if}
          </span>
          <span class="mt-0.5 block truncate text-xs text-muted-foreground">#{ticket.id} · {tc(ticket.category.name)} · <TimeAgo ms={ticket.lastReplyAt} /></span>
        </span>
        <span class="hidden items-center gap-1 text-xs text-muted-foreground tabular-nums sm:inline-flex"><ChatsIcon class="size-3.5" />{ticket.messageCount}</span>
        <TicketPriority priority={ticket.priority} class="hidden md:inline-flex" />
        <TicketStatus status={ticket.status} />
      </a>
    {:else}
      <div class="grid justify-items-center gap-3 px-6 py-14 text-center">
        <LifebuoyIcon class="size-8 text-muted-foreground/70" weight="duotone" />
        <p class="text-sm text-muted-foreground">{tab === 'active' ? t('Açık talebin yok.') : t('Kapalı talebin yok.')}</p>
        {#if tab === 'active'}<Button href="/tickets/new" size="sm" variant="outline"><PlusIcon />{t('Talep aç')}</Button>{/if}
      </div>
    {/each}
  </section>
</div>
