<script lang="ts">
  import UsersIcon from 'phosphor-svelte/lib/UsersThree';
  import UserIcon from 'phosphor-svelte/lib/User';
  import GhostIcon from 'phosphor-svelte/lib/Ghost';
  import BroadcastIcon from 'phosphor-svelte/lib/Broadcast';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { formatNumber } from '$lib/format';
  import { profileUrl } from '$lib/viewer';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const o = $derived(data.online);
  const tiles = $derived([
    { icon: BroadcastIcon, label: t('Toplam'), value: o.total + o.guests, tone: 'var(--success)' },
    { icon: UserIcon, label: t('Üye'), value: o.total, tone: 'var(--primary)' },
    { icon: GhostIcon, label: t('Misafir'), value: o.guests, tone: 'var(--muted-foreground)' },
  ]);
</script>

<PageHeader icon={UsersIcon} title={t('Çevrimiçi')} description={t('Son {minutes} dakika içinde forumda olanlar.', { minutes: o.windowMinutes })} />

<div class="mb-5 grid grid-cols-3 gap-3" data-part="online-stats">
  {#each tiles as s (s.label)}
    <div class="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-card sm:p-4">
      <span class="flex size-10 shrink-0 items-center justify-center rounded-xl max-sm:hidden" style="background:color-mix(in oklch, {s.tone} 15%, transparent);color:{s.tone}"><s.icon class="size-5" weight="duotone" /></span>
      <span class="min-w-0">
        <span class="block text-xl font-bold tabular-nums">{formatNumber(s.value)}</span>
        <span class="block truncate text-xs text-muted-foreground">{s.label}</span>
      </span>
    </div>
  {/each}
</div>

{#if o.users.length}
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each o.users as u, i (u.id)}
      <a
        href={profileUrl(u)}
        class="flex animate-in items-center gap-3 rounded-xl border bg-card p-3 shadow-card transition-colors duration-300 fade-in-0 fill-mode-both hover:bg-row-hover"
        style="animation-delay:{Math.min(i, 12) * 30}ms"
      >
        <span class="relative shrink-0">
          <UserAvatar user={u} size={44} class="rounded-xl" />
          <span class="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-card bg-success"></span>
        </span>
        <span class="min-w-0 flex-1">
          <UserName user={u} link={false} class={u.hidden ? 'italic opacity-70' : ''} />
          <span class="block truncate text-xs text-muted-foreground">{u.customTitle || (u.primaryGroup ? tc(u.primaryGroup.name) : t('Üye'))}{u.hidden ? ` · ${t('gizli')}` : ''}</span>
        </span>
        {#if u.lastActiveAt}<TimeAgo ms={u.lastActiveAt} class="shrink-0 text-xs text-muted-foreground" />{/if}
      </a>
    {/each}
  </div>
  {#if o.hiddenCount && o.users.length < o.total}
    <p class="mt-3 text-center text-xs text-muted-foreground">{t('{n} üye çevrimiçi durumunu gizliyor.', { n: o.hiddenCount })}</p>
  {/if}
{:else}
  <EmptyState icon={UsersIcon} title={t('Şu an çevrimiçi üye yok')} description={o.guests ? t('{n} misafir forumu geziyor.', { n: o.guests }) : undefined} />
{/if}
