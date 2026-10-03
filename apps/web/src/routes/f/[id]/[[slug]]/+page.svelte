<script lang="ts">
  import { themeOptions } from '$lib/theme-options';
  import ModeratorList from '$lib/components/forum/ModeratorList.svelte';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import SquarePenIcon from 'phosphor-svelte/lib/NotePencil';
  import CheckCheckIcon from 'phosphor-svelte/lib/Checks';
  import PinIcon from 'phosphor-svelte/lib/PushPin';
  import ArrowDownWideNarrowIcon from 'phosphor-svelte/lib/SortDescending';
  import InfoIcon from 'phosphor-svelte/lib/Info';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDown';
  import { Button } from '$lib/components/ui/button';
  import Breadcrumbs from '$lib/components/forum/Breadcrumbs.svelte';
  import BoardIcon from '$lib/components/forum/BoardIcon.svelte';
  import BoardRow from '$lib/components/forum/BoardRow.svelte';
  import TopicRow from '$lib/components/forum/TopicRow.svelte';
  import ExtensionSlotView from '$lib/components/ExtensionSlotView.svelte';
  import PageJump from '$lib/components/forum/PageJump.svelte';
  import Combobox from '$lib/components/Combobox.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api, errorMessage } from '$lib/api';
  import { formatNumber } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const b = $derived(data.board);
  const viewer = $derived(data.viewer);

  const SORTS = [
    { value: 'last_post', label: 'Son mesaj' },
    { value: 'created', label: 'Açılış tarihi' },
    { value: 'replies', label: 'Yanıt sayısı' },
    { value: 'views', label: 'Görüntülenme' },
    { value: 'title', label: 'Başlık' },
  ];

  let marking = $state(false);

  function setQuery(key: string, value: string | null) {
    const url = new URL(page.url);
    if (value === null || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    url.searchParams.delete('page');
    void goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
  }

  async function markRead() {
    marking = true;
    try {
      await api.post(`/api/boards/${b.board.id}/mark-read`);
      toast.success(t('Bölüm okundu olarak işaretlendi.'));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      marking = false;
    }
  }
</script>

<svelte:head><title>{tc(b.board.name)} · {viewer.settings['general.forumName']}</title></svelte:head>

<Breadcrumbs items={b.breadcrumbs.slice(0, -1)} current={tc(b.board.name)} />

{#snippet actions(onCover: boolean)}
  <div class="flex flex-wrap items-center gap-2">
    {#if viewer.user}
      <Button variant={onCover ? 'secondary' : 'ghost'} size="sm" onclick={markRead} disabled={marking} class={onCover ? 'bg-black/40 text-white backdrop-blur hover:bg-black/60' : 'text-muted-foreground'}>
        <CheckCheckIcon />{t('Okundu say')}
      </Button>
    {/if}
    {#if b.can.createTopic}
      <Button href="/f/{b.board.id}/new" class="shadow-sm"><SquarePenIcon />{t('Yeni konu aç')}</Button>
    {:else if !viewer.user}
      <Button href="/login?next={encodeURIComponent(page.url.pathname)}" variant={onCover ? 'secondary' : 'outline'}>{t('Konu açmak için giriş yapın')}</Button>
    {/if}
  </div>
{/snippet}

{#if b.board.cover}
  <!-- Kapak fotoğraflı başlık -->
  <header data-part="board-header" class="relative mb-6 animate-in overflow-hidden rounded-xl border bg-card shadow-card duration-300 fade-in-0">
    <div class="relative h-44 sm:h-56">
      <img src={b.board.cover} alt="" class="absolute inset-0 size-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/5"></div>
      <div class="absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-4 p-4 sm:p-6">
        <BoardIcon icon={b.board.icon} size={60} class="shadow-lg ring-2 ring-white/20" />
        <div class="min-w-0 flex-1 text-white">
          <h1 class="text-2xl font-extrabold tracking-tight drop-shadow sm:text-3xl">{tc(b.board.name)}</h1>
          {#if b.board.description}<p class="mt-1 max-w-2xl text-sm text-white/85">{tc(b.board.description)}</p>{/if}
        </div>
        {@render actions(true)}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-x-5 gap-y-1 border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-6">
      <span><strong class="text-foreground tabular-nums">{formatNumber(b.board.topicCount)}</strong> {t('konu')}</span>
      <span><strong class="text-foreground tabular-nums">{formatNumber(b.board.postCount)}</strong> {t('mesaj')}</span>
      <ModeratorList moderators={b.board.moderators} compact />
    </div>
  </header>
{:else}
  <header data-part="board-header" class="mb-6 flex animate-in flex-wrap items-start gap-4 duration-300 fade-in-0">
    <BoardIcon icon={b.board.icon} unread size={56} />
    <div class="min-w-0 flex-1">
      <h1 class="text-2xl font-semibold tracking-tight">{tc(b.board.name)}</h1>
      {#if b.board.description}<p class="mt-1 text-sm text-muted-foreground">{tc(b.board.description)}</p>{/if}
      <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span><strong class="text-foreground tabular-nums">{formatNumber(b.board.topicCount)}</strong> {t('konu')}</span>
        <span><strong class="text-foreground tabular-nums">{formatNumber(b.board.postCount)}</strong> {t('mesaj')}</span>
        <ModeratorList moderators={b.board.moderators} compact />
      </div>
    </div>
    <div class="w-full sm:w-auto">{@render actions(false)}</div>
  </header>
{/if}

{#if b.board.aboutHtml}
  <details class="group mb-6 overflow-hidden rounded-xl border bg-card" open data-part="board-about">
    <summary class="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-bold select-none hover:bg-accent/40">
      <InfoIcon class="size-4 text-primary" weight="fill" />{t('Bölüm hakkında')}
      <CaretDownIcon class="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
    </summary>
    <div class="prose-forum border-t px-5 py-4 text-sm">{@html b.board.aboutHtml}</div>
  </details>
{/if}

{#if b.children.length}
  <section class="mb-6 overflow-hidden rounded-2xl border bg-card shadow-card">
    <h2 class="border-b bg-panel-header px-5 py-2.5 text-sm font-semibold">{t('Alt bölümler')}</h2>
    <div class={themeOptions(data.viewer.settings)?.forumList.style === 'cards' ? 'grid gap-3 p-3 sm:grid-cols-2 sm:p-4' : 'divide-y'}>
      {#each b.children as child (child.id)}<BoardRow board={child} />{/each}
    </div>
  </section>
{/if}

<div class="mb-3 flex flex-wrap items-center gap-2">
  <PageJump page={b.topics.page} perPage={b.topics.perPage} total={b.topics.total} />
  <div class="ml-auto flex flex-wrap items-center gap-2">
    {#if b.prefixes.length}
      <Combobox
        class="w-44"
        options={b.prefixes.map((p) => ({ value: p.id, label: p.name, swatch: p.color ?? 'var(--primary)' }))}
        value={b.prefixId}
        placeholder={t('Tüm önekler')}
        clearable
        onchange={(v) => setQuery('prefix', v ? String(v) : null)}
      />
    {/if}
    <Combobox class="w-44" options={SORTS.map((s) => ({ ...s, label: t(s.label) }))} value={b.sort} onchange={(v) => setQuery('sort', v === 'last_post' ? null : String(v))} />
    <Button
      variant="outline"
      size="icon"
      title={b.dir === 'desc' ? t('Azalan') : t('Artan')}
      aria-label={t('Sıralama yönü')}
      onclick={() => setQuery('dir', b.dir === 'desc' ? 'asc' : null)}
    >
      <ArrowDownWideNarrowIcon class="transition-transform {b.dir === 'asc' ? 'rotate-180' : ''}" />
    </Button>
  </div>
</div>

{#if data.extTop.length}<div class="mb-6 grid gap-3"><ExtensionSlotView items={data.extTop} key="boardTop" /></div>{/if}

<section data-part="topic-list" class="overflow-hidden rounded-2xl border bg-card shadow-card">
  {#if b.pinned.length}
    <h2 class="flex items-center gap-2 border-b bg-[color-mix(in_oklch,var(--primary)_8%,var(--card))] px-5 py-2 text-xs font-semibold tracking-wide text-primary uppercase">
      <PinIcon class="size-3.5 -rotate-45" />{t('Sabit konular')}
    </h2>
    <div class="divide-y border-b">
      {#each b.pinned as topic (topic.id)}<TopicRow {topic} />{/each}
    </div>
  {/if}
  {#if b.topics.items.length}
    <div class="divide-y">
      {#each b.topics.items as topic, i (topic.id)}
        <div class="animate-in duration-300 fade-in-0 fill-mode-both" style="animation-delay:{Math.min(i, 10) * 25}ms"><TopicRow {topic} /></div>
      {/each}
    </div>
  {:else if !b.pinned.length}
    <div class="p-6">
      <EmptyState title={t('Bu bölümde henüz konu yok')} description={b.can.createTopic ? t('İlk konuyu sen aç!') : undefined}>
        {#if b.can.createTopic}<Button href="/f/{b.board.id}/new" size="sm"><SquarePenIcon />{t('Yeni konu aç')}</Button>{/if}
      </EmptyState>
    </div>
  {/if}
</section>

<div class="mt-4 flex justify-end">
  <PageJump page={b.topics.page} perPage={b.topics.perPage} total={b.topics.total} />
</div>
