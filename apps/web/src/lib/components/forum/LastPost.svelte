<script lang="ts">
  import type { UserSummary } from '@forum/shared';
  import UserAvatar from '../UserAvatar.svelte';
  import UserName from '../UserName.svelte';
  import TimeAgo from '../TimeAgo.svelte';

  interface Props {
    author: UserSummary | null;
    authorName: string;
    at: number;
    title?: string | null;
    href?: string | null;
  }
  let { author, authorName, at, title = null, href = null }: Props = $props();
</script>

<div class="flex min-w-0 items-center gap-2.5" data-part="last-post">
  <UserAvatar user={author ?? { displayName: authorName || '?', avatarUrl: null }} size={36} />
  <div class="min-w-0 text-[13px] leading-snug">
    {#if title && href}
      <a {href} class="block truncate font-semibold transition-colors hover:text-highlight" {title}>{title}</a>
    {/if}
    <div class="truncate text-xs text-muted-foreground">
      {#if author}<UserName user={author} class="text-xs" />{:else}<span>{authorName}</span>{/if}
      · <a href={href ?? undefined} class="hover:underline"><TimeAgo ms={at} /></a>
    </div>
  </div>
</div>
