<script lang="ts">
  import SquarePenIcon from 'phosphor-svelte/lib/NotePencil';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight';
  import BoardIcon from '$lib/components/forum/BoardIcon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { formatCompact } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  let q = $state('');
  const postable = $derived(new Set(data.forum.postableBoards.map((b) => b.id)));
  const needle = $derived(q.trim().toLocaleLowerCase('tr-TR'));
  const cats = $derived(
    data.forum.categories
      .map((c) => ({
        ...c,
        boards: c.boards
          .flatMap((b) => [
            ...(postable.has(b.id) ? [{ id: b.id, name: b.name, description: b.description, icon: b.icon, topics: b.topicCount, parent: null as string | null }] : []),
            ...b.children.filter((ch) => postable.has(ch.id)).map((ch) => ({ id: ch.id, name: ch.name, description: '', icon: b.icon, topics: null as number | null, parent: b.name })),
          ])
          .filter((b) => !needle || `${b.name} ${b.description} ${b.parent ?? ''}`.toLocaleLowerCase('tr-TR').includes(needle)),
      }))
      .filter((c) => c.boards.length),
  );
</script>

<svelte:head><title>{t('Yeni konu aç')}</title></svelte:head>

<header class="mb-6 flex flex-wrap items-end gap-4">
  <div class="min-w-0 flex-1">
    <h1 class="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight"><SquarePenIcon class="size-7 text-primary" weight="duotone" />{t('Yeni konu aç')}</h1>
    <p class="mt-1 text-sm text-muted-foreground">{t('Konunun en iyi uyduğu bölümü seç; doğru bölüm daha hızlı yanıt demek.')}</p>
  </div>
  <div class="relative w-full sm:w-72">
    <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
    <input bind:value={q} placeholder={t('Bölüm ara…')} class="h-10 w-full rounded-md border bg-card pr-3 pl-9 text-sm outline-none focus:border-ring" aria-label={t('Bölüm ara')} />
  </div>
</header>

{#if cats.length}
  <div class="grid gap-7">
    {#each cats as c (c.id)}
      <section>
        <h2 class="mb-2.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">{c.name}</h2>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {#each c.boards as b (b.id)}
            <a href="/f/{b.id}/new" class="group flex items-start gap-3.5 rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-card">
              <BoardIcon icon={b.icon} unread size={42} />
              <span class="grid min-w-0 flex-1 gap-0.5">
                <span class="flex items-center gap-2">
                  <span class="truncate font-bold group-hover:text-highlight">{b.name}</span>
                  <ArrowRightIcon class="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </span>
                {#if b.parent}<span class="text-xs text-muted-foreground">{t('{parent} içinde', { parent: b.parent })}</span>{/if}
                {#if b.description}<span class="line-clamp-2 text-sm text-muted-foreground">{b.description}</span>{/if}
                {#if b.topics !== null}<span class="mt-1 text-xs text-muted-foreground">{t('{n} konu', { n: formatCompact(b.topics) })}</span>{/if}
              </span>
            </a>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{:else}
  <EmptyState title={needle ? t('Eşleşen bölüm yok') : t('Konu açabileceğin bölüm yok')} description={needle ? t('Farklı bir kelimeyle aramayı dene.') : t('Yetkin olan bir bölüm bulunamadı.')} />
{/if}
