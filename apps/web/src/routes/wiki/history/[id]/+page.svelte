<script lang="ts">
  import type { WikiTreeNode } from '@forum/shared';
  import ClockIcon from 'phosphor-svelte/lib/ClockCounterClockwise';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import ArrowCounterIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
  import { Button } from '$lib/components/ui/button';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import { formatDateTime, formatNumber } from '$lib/format';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const find = (nodes: WikiTreeNode[]): WikiTreeNode | null => {
    for (const n of nodes) {
      if (n.id === data.pageId) return n;
      const c = find(n.children);
      if (c) return c;
    }
    return null;
  };
  const node = $derived(find(data.wiki.tree));
  const latestId = $derived(data.revisions[0]?.id);
</script>

<svelte:head><title>{t('Sayfa geçmişi')} · {data.wiki.title}</title></svelte:head>

<div class="grid gap-5" data-part="wiki-history">
  <div class="flex flex-wrap items-center gap-2">
    <Button variant="ghost" href={node ? `/wiki/${node.path}` : '/wiki'}><ArrowLeftIcon />{node?.title ?? 'Wiki'}</Button>
    <h1 class="flex items-center gap-2 text-xl font-extrabold"><ClockIcon class="size-5 text-muted-foreground" />{t('Sayfa geçmişi')}</h1>
    <span class="text-sm text-muted-foreground">{t('{n} sürüm', { n: data.revisions.length })}</span>
  </div>

  <div class="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
    <ol class="grid content-start gap-1.5">
      {#each data.revisions as r, i (r.id)}
        <li>
          <a
            href="?rev={r.id}"
            data-sveltekit-noscroll
            class={cn('grid gap-1 rounded-lg border px-3 py-2.5 text-sm transition-colors', data.selected?.id === r.id ? 'border-primary bg-primary-soft' : 'bg-card hover:bg-accent')}
          >
            <span class="flex items-center gap-2">
              {#if r.user}<UserAvatar user={r.user} size={20} />{/if}
              <span class="truncate font-semibold">{r.user?.displayName ?? t('Bilinmiyor')}</span>
              {#if i === 0}<span class="ml-auto rounded bg-success/15 px-1.5 text-[10px] font-bold text-success">{t('Güncel')}</span>{/if}
            </span>
            <span class="text-xs text-muted-foreground">{formatDateTime(r.createdAt)} · {t('{n} karakter', { n: formatNumber(r.size) })}</span>
            {#if r.note}<span class="text-xs">{r.note}</span>{/if}
          </a>
        </li>
      {/each}
    </ol>

    {#if data.selected}
      <article class="min-w-0 rounded-xl border bg-card">
        <header class="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <div class="min-w-0 flex-1">
            <p class="font-bold">{data.selected.title}</p>
            <p class="text-xs text-muted-foreground">{formatDateTime(data.selected.createdAt)}{#if data.selected.user} · {data.selected.user.displayName}{/if}</p>
          </div>
          {#if data.wiki.canEdit && data.selected.id !== latestId}
            <Button size="sm" variant="outline" href="/wiki/edit/{data.pageId}?rev={data.selected.id}"><ArrowCounterIcon />{t('Bu sürüme geri dön')}</Button>
          {/if}
        </header>
        <div class="prose-forum px-5 py-5 text-[15px]">{@html data.selected.html}</div>
      </article>
    {/if}
  </div>
</div>
