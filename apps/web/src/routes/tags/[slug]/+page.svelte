<script lang="ts">
  import HashIcon from 'phosphor-svelte/lib/Hash';
  import SealCheckIcon from 'phosphor-svelte/lib/SealCheck';
  import TopicRow from '$lib/components/forum/TopicRow.svelte';
  import PageJump from '$lib/components/forum/PageJump.svelte';
  import TagChips from '$lib/components/forum/TagChips.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { Button } from '$lib/components/ui/button';
  import { formatNumber } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const p = $derived(data.tagPage);
  const tag = $derived(p.tag);
</script>

<svelte:head><title>#{tag.name} · {data.viewer.settings['general.forumName']}</title></svelte:head>

<header class="mb-6 flex flex-wrap items-center gap-4" data-part="tag-header">
  <span class="flex size-14 items-center justify-center rounded-xl bg-primary-soft text-primary" style={tag.color ? `background:color-mix(in oklch, ${tag.color} 18%, transparent);color:${tag.color}` : ''}>
    <HashIcon class="size-7" weight="bold" />
  </span>
  <div class="min-w-0 flex-1">
    <h1 class="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
      {tag.name}
      {#if tag.isOfficial}<SealCheckIcon class="size-5 text-primary" weight="fill" aria-label={t('Resmi etiket')} />{/if}
    </h1>
    <p class="text-sm text-muted-foreground">{t('{n} konu bu etiketi taşıyor', { n: formatNumber(tag.topicCount) })}</p>
  </div>
  <Button variant="outline" href="/search?tag={tag.slug}">{t('Etikette ara')}</Button>
</header>

{#if p.related.length}
  <div class="mb-4 flex flex-wrap items-center gap-2 text-sm">
    <span class="text-muted-foreground">{t('İlgili etiketler:')}</span>
    <TagChips tags={p.related} />
  </div>
{/if}

{#if p.topics.items.length}
  <div class="mb-3 flex justify-end"><PageJump page={p.topics.page} perPage={p.topics.perPage} total={p.topics.total} /></div>
  <section class="overflow-hidden rounded-xl border bg-card shadow-card">
    <div class="divide-y">
      {#each p.topics.items as topic (topic.id)}
        <TopicRow {topic} board={topic.board} />
      {/each}
    </div>
  </section>
  <div class="mt-4 flex justify-end"><PageJump page={p.topics.page} perPage={p.topics.perPage} total={p.topics.total} /></div>
{:else}
  <EmptyState title={t('Bu etikette konu yok')} description={t('Görebildiğin bölümlerde bu etiketi taşıyan konu bulunamadı.')}>
    <Button href="/" size="sm" variant="outline">{t('Foruma dön')}</Button>
  </EmptyState>
{/if}
