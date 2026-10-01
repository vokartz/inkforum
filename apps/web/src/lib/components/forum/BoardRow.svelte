<script lang="ts">
  import type { BoardSummary } from '@forum/shared';
  import TreeIcon from 'phosphor-svelte/lib/ArrowElbowDownRight';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import BoardIcon from './BoardIcon.svelte';
  import LastPost from './LastPost.svelte';
  import ModeratorList from './ModeratorList.svelte';
  import { formatCompact, formatDateTime, formatNumber } from '$lib/format';
  import { page } from '$app/state';
  import UserName from '../UserName.svelte';
  import { t } from '$lib/i18n.svelte';

  let { board }: { board: BoardSummary } = $props();

  const href = $derived(board.type === 'redirect' ? `/go/${board.id}` : `/f/${board.id}/${board.slug}`);
  const external = $derived(board.type === 'redirect' && !!board.redirectUrl && /^https?:/i.test(board.redirectUrl));
  const preload = $derived(board.type === 'redirect' ? 'off' : undefined);
  // Klasik tema (SMF): sayılar ve son mesaj eski forumlardaki gibi yazıyla
  const classic = $derived(page.data.viewer?.settings['appearance.themeStyle'] === 'classic');
</script>

{#if classic}
  <!-- SMF: simge, bölüm, sayılar ve son mesaj ayrı hücrelerde -->
  <div class="@container">
    <div data-part="board-row" data-unread={board.unread || undefined} class="smf-board grid grid-cols-[3.25rem_1fr] gap-[3px] @3xl:grid-cols-[3.25rem_minmax(0,1fr)_9.5rem_18rem]">
      <a {href} class="smf-cell flex items-center justify-center" aria-hidden="true" tabindex="-1" data-sveltekit-preload-data={preload}>
        <BoardIcon icon={board.icon} unread={board.unread} redirect={board.type === 'redirect'} size={34} />
      </a>
      <div class="smf-cell-2 min-w-0 px-3 py-2.5">
        <a {href} class="text-[15px] font-bold text-link hover:underline" data-sveltekit-preload-data={preload}>{board.name}</a>
        {#if external}<ArrowSquareOutIcon class="ml-1 inline size-3.5 text-muted-foreground" />{/if}
        {#if board.description}<p class="text-[13px] leading-snug">{board.description}</p>{/if}
        {#if board.type === 'redirect'}<p class="text-xs text-muted-foreground">{t('{n} yönlendirme', { n: formatNumber(board.redirectClicks) })}</p>{/if}
        <ModeratorList moderators={board.moderators} compact class="mt-0.5" />
        {#if board.children.length}
          <p class="mt-0.5 text-[13px]" data-part="subboards">
            <b>{t('Alt bölümler:')}</b>
            {#each board.children as c, i (c.id)}
              <a
                href={c.type === 'redirect' ? `/go/${c.id}` : `/f/${c.id}/${c.slug}`}
                class="text-[var(--smf-text)] hover:underline {c.unread ? 'font-bold' : ''}"
                data-sveltekit-preload-data={c.type === 'redirect' ? 'off' : undefined}>{c.name}</a
              >{#if i < board.children.length - 1},{/if}
            {/each}
          </p>
        {/if}
      </div>
      {#if board.type === 'forum'}
        <p class="smf-cell col-span-2 px-3 py-1.5 text-xs @3xl:col-span-1 @3xl:flex @3xl:flex-col @3xl:items-center @3xl:justify-center @3xl:py-2" data-part="board-stats">
          <span><span class="tabular-nums">{formatNumber(board.postCount)}</span> {t('Mesaj')}</span><span class="@3xl:hidden"> · </span>
          <span><span class="tabular-nums">{formatNumber(board.topicCount)}</span> {t('Konu')}</span>
        </p>
        <div class="smf-cell-2 col-span-2 min-w-0 px-3 py-2 text-xs leading-relaxed @3xl:col-span-1 @3xl:flex @3xl:flex-col @3xl:justify-center" data-part="last-post">
          {#if board.lastPost}
            <p class="truncate">
              <b>{t('Son mesaj')}</b> {t('gönderen')}
              {#if board.lastPost.author}<UserName user={board.lastPost.author} class="text-xs" />{:else}{board.lastPost.authorName}{/if}
            </p>
            <p class="truncate"><a href="/p/{board.lastPost.postId}" class="text-[var(--smf-text)] hover:underline" title={board.lastPost.topicTitle}>{board.lastPost.topicTitle}</a> {t('konusunda')}</p>
            <p>{formatDateTime(board.lastPost.at)}</p>
          {/if}
        </div>
      {:else}
        <div class="smf-cell-2 col-span-2 hidden @3xl:block"></div>
      {/if}
    </div>
  </div>
{:else}
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
        <a {href} class="text-[15px] leading-tight font-bold transition-colors hover:text-highlight" data-sveltekit-preload-data={preload}>{board.name}</a>
        {#if external}<ArrowSquareOutIcon class="size-3.5 text-muted-foreground" />{/if}
      </h3>
      {#if board.description}<p class="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{board.description}</p>{/if}
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
                data-sveltekit-preload-data={c.type === 'redirect' ? 'off' : undefined}>{c.name}</a
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
{/if}
