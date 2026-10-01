<script lang="ts">
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDown';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { auditLabel } from '$lib/audit-labels';
  import { cn } from '$lib/utils';
  import PageHeaderIcon from 'phosphor-svelte/lib/Scroll';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { Input } from '$lib/components/ui/input';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { formatDateTime } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  let type = $state(page.url.searchParams.get('type') ?? 'all');
  let action = $state(page.url.searchParams.get('action') ?? '');

  function apply() {
    const p = new URLSearchParams(page.url.searchParams);
    p.delete('page');
    if (type !== 'all') p.set('type', type);
    else p.delete('type');
    if (action.trim()) p.set('action', action.trim());
    else p.delete('action');
    goto(`/admin/logs${p.size ? `?${p}` : ''}`, { keepFocus: true, noScroll: true });
  }

  const typeLabels: Record<string, string> = { admin: 'Yönetim', moderation: 'Moderasyon', security: 'Güvenlik', user: 'Üye' };
  let timer: ReturnType<typeof setTimeout>;
  const TYPE_TONE: Record<string, string> = {
    admin: 'bg-primary-soft text-highlight',
    moderation: 'bg-warning/15 text-warning',
    security: 'bg-destructive/12 text-destructive',
  };
</script>

<PageHeader icon={PageHeaderIcon} title={t('Kayıtlar')} description={t('Yönetim, moderasyon ve güvenlik olaylarının denetim kaydı.')} />

<div class="mb-4 flex flex-wrap gap-2">
  <NativeSelect
    bind:value={type}
    onchange={apply}
    class="w-44"
    options={[{ value: 'all', label: t('Tüm türler') }, ...Object.entries(typeLabels).map(([value, label]) => ({ value, label: t(label) }))]}
  />
  <Input
    bind:value={action}
    oninput={() => {
      clearTimeout(timer);
      timer = setTimeout(apply, 350);
    }}
    placeholder={t('İşlem kodu (ör. login, user.edit)')}
    class="w-72"
  />
</div>

{#if data.logs}
  {#if !data.logs.items.length}
    <EmptyState title={t('Kayıt bulunamadı')} />
  {:else}
    <div class="overflow-hidden rounded-2xl border bg-card text-sm shadow-card">
      {#each data.logs.items as l (l.id)}
        <details class="group border-b last:border-b-0">
          <summary class="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-row-hover [&::-webkit-details-marker]:hidden">
            <UserAvatar user={l.actor ?? { displayName: t('Sistem'), avatarUrl: null }} size={30} />
            <p class="min-w-0 flex-1 truncate">
              {#if l.actor}<UserName user={l.actor} class="font-semibold" />{:else}<b>{t('Sistem')}</b>{/if}
              <span class="text-muted-foreground">{auditLabel(l.action)}</span>
              {#if l.target && l.target.id !== l.actor?.id}<span class="text-muted-foreground">→</span> <UserName user={l.target} class="font-semibold" />{:else if l.targetType && !l.target}<span class="text-xs text-muted-foreground">({l.targetType} #{l.targetId})</span>{/if}
            </p>
            <span class={cn('hidden rounded-md px-1.5 py-0.5 text-[10px] font-bold sm:inline', TYPE_TONE[l.type] ?? 'bg-muted text-muted-foreground')}>{typeLabels[l.type] ? t(typeLabels[l.type]!) : l.type}</span>
            <span class="hidden w-28 shrink-0 text-right font-mono text-[11px] text-muted-foreground md:block">{l.ip ?? ''}</span>
            <span class="w-32 shrink-0 text-right text-xs text-muted-foreground" title={formatDateTime(l.createdAt)}><TimeAgo ms={l.createdAt} /></span>
            <CaretDownIcon class="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div class="grid gap-2 border-t bg-muted/30 px-4 py-3 text-xs">
            <p class="text-muted-foreground">
              <span class="font-mono text-foreground">{l.action}</span> · {formatDateTime(l.createdAt)}{#if l.ip} · IP <span class="font-mono">{l.ip}</span>{/if}
            </p>
            {#if l.data}<pre class="overflow-x-auto rounded-lg bg-background/60 p-3">{JSON.stringify(l.data, null, 2)}</pre>{/if}
          </div>
        </details>
      {/each}
    </div>
    <Pagination page={data.logs.page} perPage={data.logs.perPage} total={data.logs.total} />
  {/if}
{/if}
