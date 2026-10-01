<script lang="ts">
  import { APPLICATION_STATUS_LABELS } from '@forum/shared';
  import TrayIcon from 'phosphor-svelte/lib/Tray';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import StatusPill from '$lib/components/applications/StatusPill.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const r = $derived(data.res);
  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ status: data.status, ...(data.form ? { form: data.form } : {}), ...patch });
    return `?${p}`;
  };
  const STATUSES = [['open', 'Açık'], ['approved', APPLICATION_STATUS_LABELS.approved], ['rejected', APPLICATION_STATUS_LABELS.rejected], ['withdrawn', APPLICATION_STATUS_LABELS.withdrawn], ['all', 'Tümü']] as const;
</script>

<svelte:head><title>{t('İnceleme kuyruğu')} · {t('Başvurular')}</title></svelte:head>

<div class="grid gap-5" data-part="application-review">
  <header class="flex items-center gap-3">
    <span class="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><TrayIcon class="size-5" weight="duotone" /></span>
    <div>
      <h1 class="text-2xl font-extrabold tracking-tight" data-part="page-title">{t('İnceleme kuyruğu')}</h1>
      <p class="text-sm text-muted-foreground">{t('İnceleme yetkin olan formlara gelen başvurular.')}</p>
    </div>
  </header>

  <div class="flex flex-wrap items-center gap-2">
    <div class="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {#each STATUSES as [v, l] (v)}
        <a href={link({ status: v, page: '1' })} class={cn('rounded-md px-3 py-1.5 text-sm font-semibold transition-colors', data.status === v ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{t(l)}</a>
      {/each}
    </div>
    <div class="ml-auto flex flex-wrap gap-1.5">
      <a href={link({ form: '', page: '1' })} class={cn('rounded-full border px-3 py-1 text-xs font-semibold', !data.form ? 'border-primary bg-primary-soft text-highlight' : 'hover:bg-accent')}>{t('Tüm formlar')}</a>
      {#each r.forms as f (f.id)}
        <a href={link({ form: String(f.id), page: '1' })} class={cn('rounded-full border px-3 py-1 text-xs font-semibold', data.form === String(f.id) ? 'border-primary bg-primary-soft text-highlight' : 'hover:bg-accent')}>
          {f.title}{#if f.pending} <span class="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{f.pending}</span>{/if}
        </a>
      {/each}
    </div>
  </div>

  {#if r.items.length}
    <div class="divide-y overflow-hidden rounded-xl border bg-card">
      {#each r.items as a (a.id)}
        <a href="/applications/view/{a.id}" class="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-row-hover">
          {#if a.user}<UserAvatar user={a.user} size={36} />{/if}
          <span class="min-w-0 flex-1">
            <b class="block truncate">{a.user?.displayName ?? t('Silinmiş üye')}</b>
            <span class="block truncate text-xs text-muted-foreground">{a.form.title} · #{a.id} · <TimeAgo ms={a.createdAt} />{#if a.reviewer} · {t('İnceleyen: {name}', { name: a.reviewer.displayName })}{/if}</span>
          </span>
          <StatusPill status={a.status} />
        </a>
      {/each}
    </div>
    <Pagination page={r.page} total={r.total} perPage={r.perPage} />
  {:else}
    <EmptyState title={t('Başvuru yok')} description={t('Bu filtreye uyan başvuru bulunmuyor.')} />
  {/if}
</div>
