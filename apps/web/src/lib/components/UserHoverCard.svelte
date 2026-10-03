<script lang="ts" module>
  import type { PublicProfile } from '$lib/types';

  const cache = new Map<number, Promise<PublicProfile | null>>();
  function fetchCard(id: number): Promise<PublicProfile | null> {
    let p = cache.get(id);
    if (!p) {
      p = fetch(`/api/users/${id}`, { credentials: 'same-origin', headers: { accept: 'application/json' } })
        .then((r) => (r.ok ? (r.json() as Promise<PublicProfile>) : null))
        .catch(() => null);
      cache.set(id, p);
    }
    return p;
  }
</script>

<script lang="ts">
  import { LinkPreview } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import type { UserSummary } from '@forum/shared';
  import MessageSquareIcon from 'phosphor-svelte/lib/ChatCenteredText';
  import CalendarIcon from 'phosphor-svelte/lib/CalendarBlank';
  import TrophyIcon from 'phosphor-svelte/lib/Trophy';
  import UserAvatar from './UserAvatar.svelte';
  import GroupBadge from './GroupBadge.svelte';
  import TimeAgo from './TimeAgo.svelte';
  import { formatDate, formatNumber } from '$lib/format';
  import { profileUrl } from '$lib/viewer';
  import { t, tc } from '$lib/i18n.svelte';

  let { user, children }: { user: UserSummary; children: Snippet } = $props();
  let data = $state<PublicProfile | null | undefined>(undefined);

  function onOpen(open: boolean) {
    if (open && data === undefined) void fetchCard(user.id).then((d) => (data = d));
  }
</script>

<LinkPreview.Root openDelay={450} closeDelay={120} onOpenChange={onOpen}>
  <LinkPreview.Trigger>
    {#snippet child({ props })}<span {...props} class="inline-flex min-w-0">{@render children()}</span>{/snippet}
  </LinkPreview.Trigger>
  <LinkPreview.Portal>
    <LinkPreview.Content
      side="bottom"
      align="start"
      sideOffset={6}
      class="z-50 w-80 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
    >
      <div
        class="h-20"
        style={data?.cover
          ? `background:url('${data.cover.url}') center ${data.cover.offset}%/cover`
          : `background:linear-gradient(135deg, ${user.color ?? 'var(--primary)'}, color-mix(in oklch, ${user.color ?? 'var(--primary)'} 25%, var(--popover)))`}
      ></div>
      <div class="px-4 pb-4">
        <div class="-mt-9 flex items-end gap-3">
          <a href={profileUrl(user)} class="relative rounded-xl border-4 border-popover bg-popover">
            <UserAvatar {user} size={64} class="rounded-lg" />
            {#if data?.isOnline}<span class="absolute -right-1 -bottom-1 size-4 rounded-full border-[3px] border-popover bg-success"></span>{/if}
          </a>
          <div class="min-w-0 pb-1">
            <a href={profileUrl(user)} class="block truncate text-base font-bold hover:underline" style={user.color ? `color:${user.color}` : undefined}>{user.displayName}</a>
            <p class="truncate text-xs text-muted-foreground">{user.primaryGroup ? tc(user.primaryGroup.name) : `@${user.username}`}</p>
          </div>
        </div>
        {#if data === undefined}
          <div class="mt-3 grid gap-2">
            <div class="h-3 w-3/4 animate-pulse rounded bg-muted"></div>
            <div class="h-3 w-1/2 animate-pulse rounded bg-muted"></div>
          </div>
        {:else if data}
          {#if data.groups.length}
            <div class="mt-3 flex flex-wrap gap-1">{#each data.groups.slice(0, 3) as g (g.id)}<GroupBadge group={g} />{/each}</div>
          {/if}
          <dl class="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div class="rounded-lg bg-muted/60 px-1 py-2"><MessageSquareIcon class="mx-auto mb-0.5 size-3.5 text-muted-foreground" /><dd class="font-semibold tabular-nums">{formatNumber(data.postCount)}</dd><dt class="text-muted-foreground">{t('mesaj')}</dt></div>
            <div class="rounded-lg bg-muted/60 px-1 py-2"><TrophyIcon class="mx-auto mb-0.5 size-3.5 text-muted-foreground" /><dd class="font-semibold tabular-nums">{formatNumber(data.achievementPoints)}</dd><dt class="text-muted-foreground">{t('puan')}</dt></div>
            <div class="rounded-lg bg-muted/60 px-1 py-2"><CalendarIcon class="mx-auto mb-0.5 size-3.5 text-muted-foreground" /><dd class="font-semibold">{formatDate(data.registeredAt).split(' ').slice(1).join(' ')}</dd><dt class="text-muted-foreground">{t('katılım')}</dt></div>
          </dl>
          <p class="mt-2 text-xs text-muted-foreground">
            {#if data.isOnline}<span class="font-medium text-success">{t('Şu an çevrimiçi')}</span>{:else if data.lastActiveAt}{t('Son görülme')} <TimeAgo ms={data.lastActiveAt} />{/if}
          </p>
        {/if}
      </div>
    </LinkPreview.Content>
  </LinkPreview.Portal>
</LinkPreview.Root>
