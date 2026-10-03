<script lang="ts">
  import type { BoardSummary } from '@forum/shared';
  import { page } from '$app/state';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import BoardIcon from './BoardIcon.svelte';
  import ModeratorList from './ModeratorList.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import UserName from '../UserName.svelte';
  import TimeAgo from '../TimeAgo.svelte';
  import { themeOptions } from '$lib/theme-options';
  import { formatCompact, formatNumber } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  let { board }: { board: BoardSummary } = $props();

  const opts = $derived(themeOptions(page.data.viewer?.settings)?.forumList);
  const style = $derived(opts?.style ?? 'table');
  const iconSize = $derived(
    opts?.icons === 'hidden' ? 0 : opts?.icons === 'small' || style === 'compact' ? 30 : 42,
  );
  const showLast = $derived(opts?.lastPost ?? true);
  const showCounts = $derived(opts?.counts ?? true);

  const href = $derived(board.type === 'redirect' ? `/go/${board.id}` : `/f/${board.id}/${board.slug}`);
  const external = $derived(
    board.type === 'redirect' && !!board.redirectUrl && /^https?:/i.test(board.redirectUrl),
  );
  const preload = $derived(board.type === 'redirect' ? 'off' : undefined);
  const isForum = $derived(board.type === 'forum');
</script>

{#snippet icon()}
  {#if iconSize}
    <a {href} aria-hidden="true" tabindex="-1" class="shrink-0" data-sveltekit-preload-data={preload}>
      <BoardIcon
        icon={board.icon}
        unread={board.unread}
        redirect={board.type === 'redirect'}
        size={iconSize}
      />
    </a>
  {/if}
{/snippet}

{#snippet title(cls = 'text-[15px]')}
  <h3 class="flex min-w-0 items-center gap-1.5">
    <a
      {href}
      class={cn(
        'truncate leading-snug font-semibold transition-colors hover:text-highlight',
        cls,
        board.unread && 'font-bold',
      )}
      data-sveltekit-preload-data={preload}>{tc(board.name)}</a
    >
    {#if external}<ArrowSquareOutIcon class="size-3.5 shrink-0 text-muted-foreground" />{/if}
  </h3>
{/snippet}

{#snippet subboards()}
  {#if board.children.length}
    <ul class="mt-2 flex flex-wrap gap-1.5" data-part="subboards">
      {#each board.children as c (c.id)}
        <li>
          <a
            href={c.type === 'redirect' ? `/go/${c.id}` : `/f/${c.id}/${c.slug}`}
            class={cn(
              'inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium transition-colors hover:bg-accent hover:text-foreground',
              c.unread ? 'text-foreground' : 'text-muted-foreground',
            )}
            data-sveltekit-preload-data={c.type === 'redirect' ? 'off' : undefined}
          >
            {#if c.unread}<span class="size-1.5 rounded-full bg-primary" aria-label={t('Okunmamış')}
              ></span>{/if}{tc(c.name)}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet lastPost(compact = false)}
  {#if board.lastPost}
    {@const lp = board.lastPost}
    <div class="flex min-w-0 items-center gap-2.5" data-part="last-post">
      {#if !compact}<UserAvatar
          user={lp.author ?? { displayName: lp.authorName || '?', avatarUrl: null }}
          size={32}
        />{/if}
      <div class="min-w-0 leading-tight">
        {#if !compact}<a
            href="/p/{lp.postId}"
            class="block truncate text-[13px] font-medium transition-colors hover:text-highlight"
            title={lp.topicTitle}>{lp.topicTitle}</a
          >{/if}
        <p class="mt-0.5 truncate text-xs text-muted-foreground">
          {#if lp.author}<UserName user={lp.author} class="text-xs" />{:else}{lp.authorName}{/if}
          · <a href="/p/{lp.postId}" class="hover:underline"><TimeAgo ms={lp.at} /></a>
        </p>
      </div>
    </div>
  {:else}
    <p class="text-xs text-muted-foreground/70" data-part="last-post">{t('Henüz konu yok')}</p>
  {/if}
{/snippet}

{#if style === 'cards'}
  <!-- Kart: kategori içinde ızgara -->
  <div
    data-part="board-row"
    data-unread={board.unread || undefined}
    class="group/board flex h-full flex-col gap-3 rounded-[calc(var(--radius)*1.1)] border bg-card p-4 transition-colors hover:border-primary/40"
  >
    <div class="flex items-start gap-3">
      {@render icon()}
      <div class="min-w-0 flex-1">
        {@render title()}
        {#if board.description}<p class="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {tc(board.description)}
          </p>{/if}
      </div>
    </div>
    {@render subboards()}
    {#if isForum && (showCounts || showLast)}
      <div
        class="mt-auto flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground"
      >
        {#if showCounts}<span class="tabular-nums"
            ><b class="font-semibold text-foreground">{formatCompact(board.topicCount)}</b>
            {t('konu')} · <b class="font-semibold text-foreground">{formatCompact(board.postCount)}</b>
            {t('mesaj')}</span
          >{/if}
        {#if showLast && board.lastPost}<span class="truncate"><TimeAgo ms={board.lastPost.at} /></span>{/if}
      </div>
    {/if}
  </div>
{:else if style === 'compact'}
  <!-- Sıkışık: tek satır -->
  <div
    data-part="board-row"
    data-unread={board.unread || undefined}
    class="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-row-hover sm:px-5"
  >
    {@render icon()}
    <div class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
      {@render title('text-[14px]')}
      {#if board.children.length}
        <span class="truncate text-xs text-muted-foreground"
          >{board.children.map((c) => tc(c.name)).join(' · ')}</span
        >
      {/if}
    </div>
    {#if isForum && showCounts}
      <span
        class="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline"
        title={t('{topics} konu, {posts} mesaj', {
          topics: formatNumber(board.topicCount),
          posts: formatNumber(board.postCount),
        })}
      >
        {formatCompact(board.topicCount)} / {formatCompact(board.postCount)}
      </span>
    {/if}
    {#if isForum && showLast}<div class="hidden w-40 shrink-0 md:block">{@render lastPost(true)}</div>{/if}
  </div>
{:else}
  <!-- Tablo: simge · ad ve açıklama · konu · mesaj · son mesaj -->
  <div class="@container">
    <div
      data-part="board-row"
      data-unread={board.unread || undefined}
      class={cn(
        'grid items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-row-hover sm:px-5',
        iconSize ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)]',
        iconSize
          ? showLast
            ? '@3xl:grid-cols-[auto_minmax(0,1fr)_auto_15rem]'
            : '@3xl:grid-cols-[auto_minmax(0,1fr)_auto]'
          : showLast
            ? '@3xl:grid-cols-[minmax(0,1fr)_auto_15rem]'
            : '@3xl:grid-cols-[minmax(0,1fr)_auto]',
      )}
    >
      {@render icon()}
      <div class="min-w-0">
        {@render title()}
        {#if board.description}<p
            class="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground"
          >
            {tc(board.description)}
          </p>{/if}
        {#if board.type === 'redirect'}<p class="mt-0.5 text-xs text-muted-foreground">
            {t('{n} yönlendirme', { n: formatNumber(board.redirectClicks) })}
          </p>{/if}
        {@render subboards()}
        <ModeratorList moderators={board.moderators} compact class="mt-1.5" />
      </div>
      {#if isForum}
        {#if showCounts}
          <dl
            class={cn(
              'flex gap-5 text-xs text-muted-foreground @3xl:gap-0',
              iconSize && 'col-start-2 @3xl:col-start-auto',
            )}
            data-part="board-stats"
          >
            {#each [{ n: board.topicCount, l: t('Konu') }, { n: board.postCount, l: t('Mesaj') }] as st (st.l)}
              <div
                class="flex items-baseline gap-1 @3xl:w-[4.75rem] @3xl:flex-col @3xl:items-center @3xl:gap-0"
              >
                <dd
                  class="text-sm font-semibold text-foreground tabular-nums @3xl:text-[15px]"
                  title={formatNumber(st.n)}
                >
                  {formatCompact(st.n)}
                </dd>
                <dt class="@3xl:text-[11px] @3xl:tracking-wide @3xl:uppercase">{st.l}</dt>
              </div>
            {/each}
          </dl>
        {:else}
          <span class="hidden @3xl:block"></span>
        {/if}
        {#if showLast}<div class={cn('min-w-0', iconSize && 'col-start-2 @3xl:col-start-auto')}>
            {@render lastPost()}
          </div>{/if}
      {/if}
    </div>
  </div>
{/if}
