<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const o = $derived(data.online);
</script>

<PageHeader
  title={t('Çevrimiçi')}
  description={t('Son {minutes} dakikada {total} üye{hidden} ve {guests} misafir.', {
    minutes: o.windowMinutes,
    total: o.total,
    hidden: o.hiddenCount ? ` (${t('{n} gizli', { n: o.hiddenCount })})` : '',
    guests: o.guests,
  })}
/>

{#if o.users.length}
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each o.users as u, i (u.id)}
      <div class="flex animate-in items-center gap-3 rounded-xl border bg-card p-3 shadow-card duration-300 fade-in-0 fill-mode-both" style="animation-delay:{Math.min(i, 12) * 30}ms">
        <span class="relative">
          <UserAvatar user={u} size={42} class="rounded-xl" />
          <span class="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-2 border-card bg-success"></span>
        </span>
        <span class="min-w-0">
          <UserName user={u} class={u.hidden ? 'italic opacity-70' : ''} />
          <span class="block truncate text-xs text-muted-foreground">{u.primaryGroup?.name ?? t('Üye')}{u.hidden ? ` · ${t('gizli')}` : ''}</span>
        </span>
      </div>
    {/each}
  </div>
{:else}
  <EmptyState title={t('Şu an çevrimiçi üye yok')} />
{/if}
