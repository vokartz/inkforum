<script lang="ts">
  import ChatsIcon from 'phosphor-svelte/lib/ChatsCircle';
  import EyeIcon from 'phosphor-svelte/lib/Eye';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import { formatDate, formatCompact } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const c = $derived(data.card);
</script>

<svelte:head><title>{c.title} · {c.forum.name}</title></svelte:head>

<!-- Başka sitelere gömülen konu kartı (oEmbed). Bağlantılar yeni sekmede açılır. -->
<article class="embed-card" style="--embed-accent:{c.forum.accent}" data-part="topic-embed">
  <header class="flex items-center gap-2.5">
    {#if c.forum.icon}<img src={c.forum.icon} alt="" class="size-6 rounded-md" />{/if}
    <a href={c.forum.url} target="_blank" rel="noopener" class="truncate text-sm font-bold hover:underline">{c.forum.name}</a>
    <span class="text-muted-foreground">·</span>
    <a href={c.board.url} target="_blank" rel="noopener" class="truncate text-sm text-muted-foreground hover:underline">{c.board.name}</a>
  </header>
  <a href={c.url} target="_blank" rel="noopener" class="group grid gap-1.5">
    <h1 class="line-clamp-2 text-lg leading-snug font-extrabold group-hover:underline">{c.title}</h1>
    {#if c.excerpt}<p class="line-clamp-2 text-sm text-muted-foreground">{c.excerpt}</p>{/if}
  </a>
  <footer class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
    <span class="flex min-w-0 items-center gap-1.5">
      {#if c.author.avatarUrl}<img src={c.author.avatarUrl} alt="" class="size-5 rounded-full object-cover" />{/if}
      <span class="truncate font-semibold text-foreground">{c.author.name}</span>
      <span>· {formatDate(c.createdAt)}</span>
    </span>
    <span class="flex items-center gap-1"><ChatsIcon class="size-3.5" />{formatCompact(c.replyCount)}</span>
    <span class="flex items-center gap-1"><EyeIcon class="size-3.5" />{formatCompact(c.viewCount)}</span>
    <a href={c.url} target="_blank" rel="noopener" class="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold text-white" style="background:var(--embed-accent)">{t('Konuyu aç')}<ArrowSquareOutIcon class="size-3.5" /></a>
  </footer>
</article>

<style>
  :global(html),
  :global(body) {
    background: transparent !important;
    overflow: hidden;
  }
  .embed-card {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    height: 100dvh;
    align-content: space-between;
    padding: 1rem 1.1rem;
    border: 1px solid var(--border);
    border-left: 4px solid var(--embed-accent);
    border-radius: 12px;
    background: var(--card);
    color: var(--foreground);
    box-sizing: border-box;
  }
</style>
