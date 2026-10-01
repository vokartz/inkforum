<script lang="ts">
  import type { BoardModerators } from '@forum/shared';
  import ShieldStarIcon from 'phosphor-svelte/lib/ShieldStar';
  import UserName from '../UserName.svelte';
  import GroupBadge from '../GroupBadge.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    moderators: BoardModerators;
    /** Satır içi küçük yazı (bölüm listesi) */
    compact?: boolean;
    class?: string;
  }
  let { moderators, compact = false, class: className }: Props = $props();
  const total = $derived(moderators.users.length + moderators.groups.length);
</script>

{#if total}
  <p class={cn('flex flex-wrap items-center gap-x-1.5 gap-y-1', compact ? 'text-xs text-muted-foreground' : 'text-sm', className)} data-part="moderators">
    <span class={cn('inline-flex items-center gap-1', compact ? '' : 'font-semibold text-muted-foreground')}>
      <ShieldStarIcon class={compact ? 'size-3.5' : 'size-4'} weight="duotone" />{t('Moderatörler:')}
    </span>
    {#each moderators.users as u, i (u.id)}
      <UserName user={u} class={compact ? 'text-xs font-semibold' : 'font-semibold'} />{#if i < total - 1}<span class="-ml-1">,</span>{/if}
    {/each}
    {#each moderators.groups as g (g.id)}
      <GroupBadge group={g} stars={false} class="py-0 text-[10.5px]" />
    {/each}
  </p>
{/if}
