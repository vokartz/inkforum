<script lang="ts">
  import type { OnlineSummary } from '@forum/shared';
  import BroadcastIcon from 'phosphor-svelte/lib/Broadcast';
  import Widget from '../Widget.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import UserHoverCard from '../UserHoverCard.svelte';
  import { t } from '$lib/i18n.svelte';

  let { online, title = null }: { online: OnlineSummary; title?: string | null } = $props();
  const MAX = 18;
  const shown = $derived(online.users.slice(0, MAX));
</script>

<Widget title={title || t('Şu an çevrimiçi')} icon={BroadcastIcon} href="/online" hrefLabel={t('Liste')}>
  <p class="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
    <span class="relative flex size-2"><span class="absolute inline-flex size-full animate-[forum-ping_2s_ease-out_infinite] rounded-full bg-success"></span><span class="relative size-2 rounded-full bg-success"></span></span>
    <b class="text-foreground">{online.total}</b> {t('üye')}{online.hiddenCount ? ` ${t('({n} gizli)', { n: online.hiddenCount })}` : ''} · <b class="text-foreground">{online.guests}</b> {t('misafir')}
  </p>
  {#if shown.length}
    <div class="flex flex-wrap gap-1.5" data-part="online-users">
      {#each shown as u (u.id)}
        <UserHoverCard user={u}>
          <a href="/u/{u.id}/{u.slug}" class="block rounded-full transition-transform hover:-translate-y-0.5 {u.hidden ? 'opacity-50' : ''}" title={u.displayName}>
            <UserAvatar user={u} size={32} />
          </a>
        </UserHoverCard>
      {/each}
      {#if online.users.length > MAX}
        <a href="/online" class="flex size-8 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground hover:bg-accent">+{online.users.length - MAX}</a>
      {/if}
    </div>
  {:else}
    <p class="text-sm text-muted-foreground">{t('Şu an çevrimiçi üye yok.')}</p>
  {/if}
</Widget>
