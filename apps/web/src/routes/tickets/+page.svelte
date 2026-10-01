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
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  let tab = $state<'active' | 'closed'>('active');
  const shown = $derived(data.items.filter((t) => (tab === 'closed') === (t.status === 'closed')));
</script>

<svelte:head><title>{t('Destek')} · {data.viewer.settings['general.forumName']}</title></svelte:head>

<div class="grid gap-6" data-part="tickets">
  <header class="relative isolate flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border bg-card p-6 sm:p-8">
    <div class="absolute -top-16 -left-10 -z-10 size-56 rounded-full bg-primary/10 blur-3xl"></div>
    <span class="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><LifebuoyIcon class="size-7" weight="duotone" /></span>
    <div class="min-w-0 flex-1">
      <h1 class="text-2xl font-extrabold tracking-tight" data-part="page-title">{t('Destek')}</h1>
      <p class="text-sm text-muted-foreground">{t('Bir sorunun mu var? Talep aç, ekibimiz en kısa sürede yanıtlasın.')}</p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if data.counts.desk !== null}
        <Button href="/tickets/desk" variant="outline"><TrayIcon />{t('Destek masası')}{#if data.counts.desk}<span class="rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{data.counts.desk}</span>{/if}</Button>
      {/if}
      <Button href="/tickets/new"><PlusIcon weight="bold" />{t('Yeni talep')}</Button>
    </div>
  </header>

  <section class="grid gap-3">
    <div class="flex items-center gap-3">
      <h2 class="font-bold">{t('Taleplerim')}</h2>
      <div class="ml-auto flex rounded-lg bg-muted p-1">
        {#each [['active', 'Açık'], ['closed', 'Kapalı']] as [v, l] (v)}
          <button type="button" class={cn('rounded-md px-3 py-1 text-sm font-semibold transition-colors', tab === v ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')} onclick={() => (tab = v as typeof tab)}>{t(l)}</button>
        {/each}
      </div>
    </div>
    {#if shown.length}
      <div class="divide-y overflow-hidden rounded-xl border bg-card">
        {#each shown as ticket (ticket.id)}
          <a href="/tickets/{ticket.id}" class={cn('flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-row-hover', ticket.status === 'answered' && 'bg-success/5')}>
            <span class="flex size-9 shrink-0 items-center justify-center rounded-lg" style="background:color-mix(in oklch, {ticket.category.color ?? 'var(--primary)'} 15%, transparent);color:{ticket.category.color ?? 'var(--primary)'}">
              {#if ticket.category.iconNodes}<NodeIcon nodes={ticket.category.iconNodes} size={18} />{:else}<LifebuoyIcon class="size-4" />{/if}
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-2"><b class="truncate">{ticket.subject}</b>{#if ticket.status === 'answered'}<span class="size-2 shrink-0 rounded-full bg-success" title={t('Yeni yanıt')}></span>{/if}</span>
              <span class="block truncate text-xs text-muted-foreground">#{ticket.id} · {ticket.category.name} · {t('son etkinlik')} <TimeAgo ms={ticket.lastReplyAt} /></span>
            </span>
            <span class="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex"><ChatsIcon class="size-3.5" />{ticket.messageCount}</span>
            <TicketPriority priority={ticket.priority} class="hidden md:inline-flex" />
            <TicketStatus status={ticket.status} />
          </a>
        {/each}
      </div>
    {:else}
      <div class="grid justify-items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <LifebuoyIcon class="size-8 text-muted-foreground" />
        <p class="text-sm text-muted-foreground">{tab === 'active' ? t('Açık talebin yok.') : t('Kapalı talebin yok.')}</p>
        {#if tab === 'active'}<Button href="/tickets/new" size="sm"><PlusIcon />{t('Talep aç')}</Button>{/if}
      </div>
    {/if}
  </section>
</div>
