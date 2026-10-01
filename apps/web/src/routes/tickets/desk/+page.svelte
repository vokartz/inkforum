<script lang="ts">
  import TrayIcon from 'phosphor-svelte/lib/Tray';
  import LifebuoyIcon from 'phosphor-svelte/lib/Lifebuoy';
  import ChatsIcon from 'phosphor-svelte/lib/ChatsCircle';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import TicketStatus from '$lib/components/tickets/TicketStatus.svelte';
  import TicketPriority from '$lib/components/tickets/TicketPriority.svelte';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const d = $derived(data.desk);
  const link = (patch: Record<string, string>) => `?${new URLSearchParams({ status: data.status, ...(data.category ? { category: data.category } : {}), ...patch })}`;
  const TABS = $derived([
    { v: 'active', l: 'Aktif', n: d.counts.open + d.counts.customer_reply + d.counts.answered + d.counts.on_hold },
    { v: 'mine', l: 'Bana atanan', n: d.counts.mine },
    { v: 'unassigned', l: 'Atanmamış', n: d.counts.unassigned },
    { v: 'open', l: 'Yeni', n: d.counts.open },
    { v: 'customer_reply', l: 'Yanıt bekliyor', n: d.counts.customer_reply },
    { v: 'answered', l: 'Yanıtlandı', n: d.counts.answered },
    { v: 'on_hold', l: 'Beklemede', n: d.counts.on_hold },
    { v: 'closed', l: 'Kapalı', n: d.counts.closed },
  ]);
</script>

<svelte:head><title>{t('Destek masası')}</title></svelte:head>

<div class="grid gap-5" data-part="ticket-desk">
  <header class="flex items-center gap-3">
    <span class="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><TrayIcon class="size-5" weight="duotone" /></span>
    <div>
      <h1 class="text-2xl font-extrabold tracking-tight" data-part="page-title">{t('Destek masası')}</h1>
      <p class="text-sm text-muted-foreground">{t('Sorumlu olduğun kategorilerdeki talepler; acil olanlar ve en uzun süredir bekleyenler önce.')}</p>
    </div>
  </header>

  <div class="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
    <nav class="grid content-start gap-1" aria-label={t('Filtreler')}>
      {#each TABS as tab (tab.v)}
        <a href={link({ status: tab.v, page: '1' })} class={cn('flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors', data.status === tab.v ? 'bg-primary-soft font-semibold text-highlight' : 'hover:bg-accent')}>
          {t(tab.l)}<span class="text-xs tabular-nums text-muted-foreground">{tab.n}</span>
        </a>
      {/each}
      <p class="mt-3 px-3 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{t('Kategoriler')}</p>
      <a href={link({ category: '', page: '1' })} class={cn('rounded-lg px-3 py-1.5 text-sm transition-colors', !data.category ? 'font-semibold text-highlight' : 'text-muted-foreground hover:text-foreground')}>{t('Tümü')}</a>
      {#each d.categories as c (c.id)}
        <a href={link({ category: String(c.id), page: '1' })} class={cn('flex items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors', data.category === String(c.id) ? 'font-semibold text-highlight' : 'text-muted-foreground hover:text-foreground')}>{tc(c.name)}{#if c.open}<span class="text-xs">{c.open}</span>{/if}</a>
      {/each}
    </nav>

    <div class="grid min-w-0 content-start gap-3">
      {#if d.items.length}
        <div class="divide-y overflow-hidden rounded-xl border bg-card">
          {#each d.items as t (t.id)}
            <a href="/tickets/{t.id}" class={cn('flex items-center gap-3 px-4 py-3 transition-colors hover:bg-row-hover', (t.status === 'open' || t.status === 'customer_reply') && 'border-l-2 border-l-primary')}>
              <span class="flex size-9 shrink-0 items-center justify-center rounded-lg" style="background:color-mix(in oklch, {t.category.color ?? 'var(--primary)'} 15%, transparent);color:{t.category.color ?? 'var(--primary)'}">
                {#if t.category.iconNodes}<NodeIcon nodes={t.category.iconNodes} size={17} />{:else}<LifebuoyIcon class="size-4" />{/if}
              </span>
              <span class="min-w-0 flex-1">
                <b class="block truncate">{t.subject}</b>
                <span class="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  {#if t.user}<UserAvatar user={t.user} size={16} />{t.user.displayName}{/if} · #{t.id} · {tc(t.category.name)} · <TimeAgo ms={t.lastReplyAt} />
                  {#if t.assignee} · {t.assignee.displayName}{/if}
                </span>
              </span>
              <span class="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex"><ChatsIcon class="size-3.5" />{t.messageCount}</span>
              <TicketPriority priority={t.priority} class="hidden md:inline-flex" />
              <TicketStatus status={t.status} />
            </a>
          {/each}
        </div>
        <Pagination page={d.page} total={d.total} perPage={d.perPage} />
      {:else}
        <EmptyState title={t('Talep yok')} description={t('Bu filtreye uyan destek talebi bulunmuyor.')} />
      {/if}
    </div>
  </div>
</div>
