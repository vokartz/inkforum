<script lang="ts">
  import type { UserSummary } from '@forum/shared';
  import { profileUrl } from '$lib/viewer';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import UserAvatar from './UserAvatar.svelte';
  import UserHoverCard from './UserHoverCard.svelte';

  interface Props {
    user: UserSummary | null | undefined;
    avatar?: boolean;
    avatarSize?: number;
    link?: boolean;
    card?: boolean;
    class?: string;
  }
  let { user, avatar = false, avatarSize = 20, link = true, card = true, class: className }: Props = $props();
</script>

{#if !user}
  <span class={cn('text-muted-foreground italic', className)}>{t('Bilinmeyen üye')}</span>
{:else if link}
  {#snippet anchor()}
  <a
    href={profileUrl(user)}
    class={cn('inline-flex items-center gap-1.5 font-medium hover:underline underline-offset-2', className)}
    style={user.color ? `color:${user.color}` : undefined}
    title={!card && user.username !== user.displayName ? `@${user.username}` : undefined}
  >
    {#if avatar}<UserAvatar {user} size={avatarSize} />{/if}
    <span class="truncate">{user.displayName}</span>
  </a>
  {/snippet}
  {#if card}<UserHoverCard {user}>{@render anchor()}</UserHoverCard>{:else}{@render anchor()}{/if}
{:else}
  <span class={cn('inline-flex items-center gap-1.5 font-medium', className)} style={user.color ? `color:${user.color}` : undefined}>
    {#if avatar}<UserAvatar {user} size={avatarSize} />{/if}
    <span class="truncate">{user.displayName}</span>
  </span>
{/if}
