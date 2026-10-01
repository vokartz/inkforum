<script lang="ts">
  import BookOpenIcon from 'phosphor-svelte/lib/BookOpenText';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight';
  import ClockIcon from 'phosphor-svelte/lib/ClockCounterClockwise';
  import FolderIcon from 'phosphor-svelte/lib/FolderSimple';
  import TreeIcon from 'phosphor-svelte/lib/TreeStructure';
  import { Button } from '$lib/components/ui/button';
  import WikiSearch from '$lib/components/wiki/WikiSearch.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { reveal } from '$lib/reveal';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import FileTextIcon from 'phosphor-svelte/lib/FileText';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const w = $derived(data.wiki);
  const count = (n: { children: Array<{ children: unknown[] }> }): number => n.children.reduce((s, c) => s + 1 + count(c as never), 0);
</script>

<svelte:head><title>{w.title} · {data.viewer.settings['general.forumName']}</title></svelte:head>

<div class="grid gap-8" data-part="wiki-index">
  <!-- Karşılama -->
  <header class="relative isolate overflow-hidden rounded-2xl border bg-card px-6 py-10 text-center sm:px-10 sm:py-14">
    <div class="absolute -top-24 left-1/2 -z-10 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"></div>
    <span class="mx-auto mb-4 flex size-14 animate-rise items-center justify-center rounded-2xl bg-primary-soft text-primary"><BookOpenIcon class="size-7" weight="duotone" /></span>
    <h1 class="animate-rise text-3xl font-black tracking-tight sm:text-4xl" style="--i:1">{w.title}</h1>
    {#if w.description}<p class="mx-auto mt-2 max-w-xl animate-rise text-muted-foreground" style="--i:2">{tc(w.description)}</p>{/if}
    <div class="mx-auto mt-6 max-w-xl animate-rise" style="--i:3"><WikiSearch large /></div>
    <p class="mt-3 text-xs text-muted-foreground">{t('{n} sayfa', { n: w.pageCount })}</p>
    {#if w.canEdit}
      <div class="mt-5 flex flex-wrap justify-center gap-2">
        <Button href="/wiki/new"><PlusIcon />{t('Yeni sayfa')}</Button>
        {#if w.canManage}<Button href="/admin/wiki" variant="outline"><TreeIcon />{t('Düzeni yönet')}</Button>{/if}
      </div>
    {/if}
  </header>

  {#if w.tree.length}
    <!-- Ana bölümler -->
    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each w.tree as n, i (n.id)}
        <article class="group grid content-start gap-3 rounded-xl border bg-card p-5 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift" use:reveal={i * 60}>
          <a href="/wiki/{n.path}" class="flex items-start gap-3">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary transition-transform duration-300 group-hover:scale-110">
              {#if n.iconNodes}<NodeIcon nodes={n.iconNodes} size={22} />{:else}<FolderIcon class="size-5" weight="duotone" />{/if}
            </span>
            <span class="grid min-w-0 gap-0.5">
              <span class="text-base font-bold group-hover:text-highlight">{n.title}</span>
              {#if n.summary}<span class="line-clamp-2 text-sm text-muted-foreground">{n.summary}</span>{/if}
            </span>
          </a>
          {#if n.children.length}
            <ul class="grid gap-1 border-t pt-3 text-sm">
              {#each n.children.slice(0, 5) as c (c.id)}
                <li><a href="/wiki/{c.path}" class="flex items-center gap-1.5 rounded px-1 py-0.5 text-foreground/80 hover:bg-accent hover:text-foreground">{#if c.iconNodes}<NodeIcon nodes={c.iconNodes} size={14} class="text-muted-foreground" />{:else}<ArrowRightIcon class="size-3 text-muted-foreground" />{/if}<span class="truncate">{c.title}</span></a></li>
              {/each}
              {#if count(n) > 5}<li><a href="/wiki/{n.path}" class="px-1 text-xs font-semibold text-highlight hover:underline">{t('+{n} sayfa daha', { n: count(n) - 5 })}</a></li>{/if}
            </ul>
          {/if}
        </article>
      {/each}
    </section>

    {#if w.recent.length}
      <section class="grid gap-3">
        <h2 class="flex items-center gap-2 text-lg font-extrabold"><ClockIcon class="size-5 text-muted-foreground" />{t('Son güncellenenler')}</h2>
        <div class="divide-y rounded-xl border bg-card">
          {#each w.recent as r (r.path)}
            <a href="/wiki/{r.path}" class="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-row-hover">
              <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{#if r.iconNodes}<NodeIcon nodes={r.iconNodes} size={16} />{:else}<FileTextIcon class="size-4" />{/if}</span>
              <span class="min-w-0 flex-1"><span class="block truncate font-semibold">{r.title}</span><span class="block truncate text-xs text-muted-foreground">/wiki/{r.path}</span></span>
              <span class="shrink-0 text-xs text-muted-foreground">{#if r.updatedBy}{r.updatedBy.displayName} · {/if}<TimeAgo ms={r.updatedAt} /></span>
            </a>
          {/each}
        </div>
      </section>
    {/if}
  {:else}
    <EmptyState title={t('Wiki henüz boş')} description={w.canEdit ? t('İlk sayfayı oluşturarak başlayın: kurallar, rehberler, sık sorulan sorular…') : t('Yakında burada rehberler olacak.')}>
      {#if w.canEdit}<Button href="/wiki/new"><PlusIcon />{t('İlk sayfayı oluştur')}</Button>{/if}
    </EmptyState>
  {/if}
</div>
