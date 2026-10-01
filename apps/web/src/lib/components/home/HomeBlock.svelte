<script lang="ts">
  import type { ForumIndex, HomeBlock, RecentTopicItem, UserSummary } from '@forum/shared';
  import CakeIcon from 'phosphor-svelte/lib/Cake';
  import LightningIcon from 'phosphor-svelte/lib/Lightning';
  import ChartIcon from 'phosphor-svelte/lib/ChartLineUp';
  import SparkleIcon from 'phosphor-svelte/lib/Sparkle';
  import ChatTextIcon from 'phosphor-svelte/lib/ChatText';
  import ChatsIcon from 'phosphor-svelte/lib/Chats';
  import UsersIcon from 'phosphor-svelte/lib/UsersThree';
  import Widget from '../Widget.svelte';
  import UserName from '../UserName.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import TimeAgo from '../TimeAgo.svelte';
  import OnlineUsers from '../forum/OnlineUsers.svelte';
  import AnnouncementBlock from './AnnouncementBlock.svelte';
  import TilesBlock from './TilesBlock.svelte';
  import DiscordBlock from './DiscordBlock.svelte';
  import CustomHtml from '../CustomHtml.svelte';
  import { formatCompact, formatNumber } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    block: HomeBlock;
    /** Yan sütunda mı (dar yerleşim) */
    compact?: boolean;
    forum: ForumIndex;
    recent: RecentTopicItem[];
    birthdays: UserSummary[];
  }
  let { block, compact = false, forum, recent, birthdays }: Props = $props();
</script>

{#if block.kind === 'announcement'}
  <AnnouncementBlock {block} />
{:else if block.kind === 'tiles'}
  <TilesBlock {block} {compact} />
{:else if block.kind === 'text'}
  {#if block.boxed}
    <section data-part="text-block" class="overflow-hidden rounded-2xl border bg-card shadow-card animate-rise">
      {#if block.title}<h2 class="border-b px-5 py-3.5 text-[15px] font-extrabold">{block.title}</h2>{/if}
      <div class={cn('prose-forum px-5 py-4 text-sm', compact && 'px-4')}>{@html block.html}</div>
    </section>
  {:else}
    <section data-part="text-block" class="animate-rise">
      {#if block.title}<h2 class="mb-2 text-lg font-extrabold">{block.title}</h2>{/if}
      <div class="prose-forum text-sm">{@html block.html}</div>
    </section>
  {/if}
{:else if block.kind === 'html'}
  {#if block.boxed}
    <section data-part="html-block" class="overflow-hidden rounded-2xl border bg-card shadow-card animate-rise">
      {#if block.title}<h2 class="border-b px-5 py-3.5 text-[15px] font-extrabold">{block.title}</h2>{/if}
      <CustomHtml html={block.html} class={cn('px-5 py-4 text-sm', compact && 'px-4')} part="custom-home" />
    </section>
  {:else}
    <section data-part="html-block" class="animate-rise">
      {#if block.title}<h2 class="mb-2 text-lg font-extrabold">{block.title}</h2>{/if}
      <CustomHtml html={block.html} part="custom-home" />
    </section>
  {/if}
{:else if block.kind === 'recent'}
  {#if recent.length}
    <Widget title={block.title || t('Son hareketler')} icon={LightningIcon} flush>
      <ul class="grid">
        {#each recent.slice(0, block.limit) as r, i (r.topicId)}
          <li style="--i:{i}" class="animate-rise">
            <a href={r.postId ? `/p/${r.postId}` : `/t/${r.topicId}/${r.slug}`} class="group flex gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60">
              <UserAvatar user={r.author ?? { displayName: r.authorName || '?', avatarUrl: null }} size={34} class="mt-0.5" />
              <span class="min-w-0 text-sm">
                <span class="line-clamp-1 font-semibold group-hover:text-highlight {r.unread ? '' : 'text-foreground/80'}">
                  {#if r.unread}<span class="mr-1.5 inline-block size-2 -translate-y-px rounded-full bg-primary"></span>{/if}{r.title}
                </span>
                <span class="block truncate text-xs text-muted-foreground">{r.author?.displayName ?? r.authorName} · <TimeAgo ms={r.at} /></span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </Widget>
  {/if}
{:else if block.kind === 'stats'}
  <Widget title={block.title || t('Topluluk')} icon={ChartIcon}>
    <dl class="grid grid-cols-3 gap-2 text-center">
      {#each [{ l: 'Konu', v: forum.stats.topics, i: ChatTextIcon }, { l: 'Mesaj', v: forum.stats.posts, i: ChatsIcon }, { l: 'Üye', v: forum.stats.members, i: UsersIcon }] as st (st.l)}
        <div class="rounded-xl bg-muted/60 px-1 py-3">
          <st.i class="mx-auto mb-1 size-4 text-muted-foreground" />
          <dd class="text-lg leading-none font-extrabold tabular-nums" title={formatNumber(st.v)}>{formatCompact(st.v)}</dd>
          <dt class="mt-1 text-[11px] text-muted-foreground">{t(st.l)}</dt>
        </div>
      {/each}
    </dl>
    {#if forum.stats.newestMember}
      <p class="mt-3 flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <SparkleIcon class="size-4 text-primary" weight="duotone" />{t('En yeni üye:')} <UserName user={forum.stats.newestMember} class="text-xs font-semibold" />
      </p>
    {/if}
  </Widget>
{:else if block.kind === 'online'}
  {#if forum.online}<OnlineUsers online={forum.online} title={block.title} />{/if}
{:else if block.kind === 'discord'}
  <DiscordBlock title={block.title} />
{:else if block.kind === 'birthdays'}
  {#if birthdays.length}
    <Widget title={block.title || t('Bugün doğum günü')} icon={CakeIcon}>
      <div class="flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
        {#each birthdays as u (u.id)}<UserName user={u} />{/each}
      </div>
    </Widget>
  {/if}
{/if}
