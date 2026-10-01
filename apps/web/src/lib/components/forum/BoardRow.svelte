<script lang="ts">
  import type { BoardSummary } from '@forum/shared';
  import TreeIcon from 'phosphor-svelte/lib/ArrowElbowDownRight';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import BoardIcon from './BoardIcon.svelte';
  import LastPost from './LastPost.svelte';
  import ModeratorList from './ModeratorList.svelte';
  import { formatCompact, formatNumber } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';

  let { board }: { board: BoardSummary } = $props();

  const href = $derived(board.type === 'redirect' ? `/go/${board.id}` : `/f/${board.id}/${board.slug}`);
  const external = $derived(board.type === 'redirect' && !!board.redirectUrl && /^https?:/i.test(board.redirectUrl));
  const preload = $derived(board.type === 'redirect' ? 'off' : undefined);
</script>

<div class="@container">
  <div
    data-part="board-row"
    data-unread={board.unread || undefined}
    class="group/board grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 px-4 py-4 transition-colors hover:bg-row-hover sm:px-5 @3xl:grid-cols-[auto_1fr_8.5rem_17rem]"
  >
    <a {href} aria-hidden="true" tabindex="-1" class="transition-transform duration-300 group-hover/board:scale-105" data-sveltekit-preload-data={preload}>
      <BoardIcon icon={board.icon} unread={board.unread} redirect={board.type === 'redirect'} size={46} />
    </a>

    <div class="min-w-0">
      <h3 class="flex items-center gap-1.5">
        <a {href} class="text-[15px] leading-tight font-bold transition-colors hover:text-highlight" data-sveltekit-preload-data={preload}>{tc(board.name)}</a>
        {#if external}<ArrowSquareOutIcon class="size-3.5 text-muted-foreground" />{/if}
      </h3>
      {#if board.description}<p class="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{tc(board.description)}</p>{/if}
      {#if board.type === 'redirect'}
        <p class="mt-0.5 text-xs text-muted-foreground">{t('{n} yönlendirme', { n: formatNumber(board.redirectClicks) })}</p>
      {/if}
      {#if board.children.length}
        <ul class="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[13px]" data-part="subboards">
          {#each board.children as c (c.id)}
            <li class="inline-flex items-center gap-1">
              {#if c.unread}
                <span class="size-1.5 rounded-full bg-primary" title={t('Okunmamış')}></span>
              {:else}
                <TreeIcon class="size-3 text-muted-foreground/70" />
              {/if}
              <a
                href={c.type === 'redirect' ? `/go/${c.id}` : `/f/${c.id}/${c.slug}`}
                class="font-semibold transition-colors hover:text-highlight {c.unread ? 'text-foreground' : 'text-muted-foreground'}"
                data-sveltekit-preload-data={c.type === 'redirect' ? 'off' : undefined}>{tc(c.name)}</a
              >
            </li>
          {/each}
        </ul>
      {/if}
      <ModeratorList moderators={board.moderators} compact class="mt-1.5" />
    </div>

    {#if board.type === 'forum'}
      <dl class="col-start-2 flex gap-4 text-xs text-muted-foreground @3xl:col-start-auto @3xl:grid @3xl:gap-0.5 @3xl:text-right">
        <div><dd class="inline font-bold text-foreground tabular-nums" title={formatNumber(board.topicCount)}>{formatCompact(board.topicCount)}</dd> <dt class="inline">{t('konu')}</dt></div>
        <div><dd class="inline font-bold text-foreground tabular-nums" title={formatNumber(board.postCount)}>{formatCompact(board.postCount)}</dd> <dt class="inline">{t('mesaj')}</dt></div>
      </dl>
      <div class="col-start-2 min-w-0 @3xl:col-start-auto @3xl:border-l @3xl:pl-4">
        {#if board.lastPost}
          <LastPost author={board.lastPost.author} authorName={board.lastPost.authorName} at={board.lastPost.at} title={board.lastPost.topicTitle} href="/p/{board.lastPost.postId}" />
        {:else}
          <span class="text-xs text-muted-foreground">{t('Henüz mesaj yok')}</span>
        {/if}
      </div>
    {/if}
  </div>
</div>
