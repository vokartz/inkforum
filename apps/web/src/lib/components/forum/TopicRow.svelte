<script lang="ts">
  import type { TopicListItem } from '@forum/shared';
  import PinIcon from 'phosphor-svelte/lib/PushPin';
  import LockIcon from 'phosphor-svelte/lib/Lock';
  import FlameIcon from 'phosphor-svelte/lib/Fire';
  import StarIcon from 'phosphor-svelte/lib/Star';
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight';
  import EyeOffIcon from 'phosphor-svelte/lib/EyeSlash';
  import HiddenIcon from 'phosphor-svelte/lib/LockKey';
  import Trash2Icon from 'phosphor-svelte/lib/Trash';
  import UserAvatar from '../UserAvatar.svelte';
  import UserName from '../UserName.svelte';
  import TimeAgo from '../TimeAgo.svelte';
  import PrefixBadge from './PrefixBadge.svelte';
  import TagChips from './TagChips.svelte';
  import ChartIcon from 'phosphor-svelte/lib/ChartBar';
  import LastPost from './LastPost.svelte';
  import { formatCompact } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  interface Props {
    topic: TopicListItem;
    board?: { id: number; name: string; slug: string } | null;
    /** Okunmamış listesinde doğrudan ilk okunmamış mesaja git. */
    unreadPostId?: number | null;
  }
  let { topic, board = null, unreadPostId = null }: Props = $props();

  const href = $derived(`/t/${topic.isMoved ? topic.movedToTopicId : topic.id}/${topic.slug}`);
  const titleHref = $derived(unreadPostId ? `/p/${unreadPostId}` : topic.unread && !topic.isMoved ? `${href}?page=unread` : href);
  const pageLinks = $derived.by(() => {
    if (topic.pages <= 1) return [];
    if (topic.pages <= 4) return Array.from({ length: topic.pages - 1 }, (_, i) => i + 2);
    return [2, 3, topic.pages];
  });
</script>

<div class="@container">
<div
  data-part="topic-row"
  data-unread={topic.unread || undefined}
  class={cn(
    'group/topic grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-2 px-4 py-3 transition-colors hover:bg-row-hover sm:px-5 @3xl:grid-cols-[auto_1fr_7rem_14rem]',
    (topic.isDeleted || !topic.isApproved) && 'bg-destructive/5',
  )}
>
  <div class="relative">
    <UserAvatar user={topic.author ?? { displayName: topic.authorName || '?', avatarUrl: null }} size={40} class="rounded-xl" />
    {#if topic.unread}<span class="absolute -top-1 -right-1 size-3 rounded-full border-2 border-card bg-primary" title={t('Okunmamış')}></span>{/if}
  </div>

  <div class="min-w-0">
    <div class="flex flex-wrap items-center gap-1.5">
      {#if topic.isPinned}<PinIcon class="size-3.5 shrink-0 -rotate-45 text-primary" aria-label={t('Sabit')} />{/if}
      {#if topic.isFeatured}<StarIcon class="size-3.5 shrink-0 text-amber-400" weight="fill" aria-label={t('Öne çıkan')} />{/if}
      {#if topic.isLocked && !topic.isMoved}<LockIcon class="size-3.5 shrink-0 text-muted-foreground" aria-label={t('Kilitli')} />{/if}
      {#if topic.hot && !topic.isMoved}<FlameIcon class="size-3.5 shrink-0 text-orange-500" aria-label={t('Popüler')} />{/if}
      {#if topic.hasPoll && !topic.isMoved}<ChartIcon class="size-3.5 shrink-0 text-primary" aria-label={t('Anket')} />{/if}
      {#if topic.isHidden}<HiddenIcon class="size-3.5 shrink-0 text-warning" aria-label={t('Gizli konu')} />{/if}
      {#if !topic.isApproved}<EyeOffIcon class="size-3.5 shrink-0 text-destructive" aria-label={t('Onay bekliyor')} />{/if}
      {#if topic.isDeleted}<Trash2Icon class="size-3.5 shrink-0 text-destructive" aria-label={t('Silinmiş')} />{/if}
      {#if topic.prefix}<PrefixBadge prefix={topic.prefix} />{/if}
      {#if topic.isMoved}<span class="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><ArrowRightIcon class="size-3" />{t('Taşındı:')}</span>{/if}
      <a href={titleHref} class={cn('min-w-0 text-[15px] leading-snug hover:text-highlight', topic.unread ? 'font-semibold' : 'font-medium')}>
        {topic.title}
      </a>
      {#if topic.tags?.length}<TagChips tags={topic.tags} size="xs" class="ml-0.5" />{/if}
    </div>
    <div class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      {#if topic.author}<UserName user={topic.author} class="text-xs" />{:else}<span>{topic.authorName}</span>{/if}
      <span>·</span>
      <TimeAgo ms={topic.createdAt} />
      {#if board}
        <span>·</span>
        <a href="/f/{board.id}/{board.slug}" class="hover:text-foreground hover:underline">{tc(board.name)}</a>
      {/if}
      {#if pageLinks.length}
        <span class="ml-1 flex items-center gap-0.5" aria-label={t('Sayfalar')}>
          {#each pageLinks as p, i (p)}
            {#if i === 2 && topic.pages > 4}<span>…</span>{/if}
            <a href="{href}?page={p}" class="rounded border px-1 leading-4 hover:border-primary hover:text-highlight">{p}</a>
          {/each}
        </span>
      {/if}
    </div>
  </div>

  {#if !topic.isMoved}
    <div class="col-start-2 flex gap-4 text-sm @3xl:col-start-auto @3xl:block @3xl:text-center">
      <div><span class="font-semibold tabular-nums">{formatCompact(topic.replyCount)}</span> <span class="text-muted-foreground @3xl:block @3xl:text-xs">{t('yanıt')}</span></div>
      <div class="@3xl:mt-0.5"><span class="tabular-nums @3xl:text-xs @3xl:text-muted-foreground">{formatCompact(topic.viewCount)}</span> <span class="text-muted-foreground @3xl:text-xs">{t('görüntülenme')}</span></div>
    </div>
    <div class="col-start-2 min-w-0 @3xl:col-start-auto">
      <LastPost author={topic.lastPost.author} authorName={topic.lastPost.authorName} at={topic.lastPost.at} href={topic.lastPost.postId ? `/p/${topic.lastPost.postId}` : href} />
    </div>
  {/if}
</div>
</div>
