<script lang="ts">
  import { extractHeadings } from '@forum/shared';
  import { goto, invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import BookOpenIcon from 'phosphor-svelte/lib/BookOpenText';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import ClockIcon from 'phosphor-svelte/lib/ClockCounterClockwise';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import LockIcon from 'phosphor-svelte/lib/LockSimple';
  import EyeIcon from 'phosphor-svelte/lib/Eye';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeft';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRight';
  import ListIcon from 'phosphor-svelte/lib/SidebarSimple';
  import LinkIcon from 'phosphor-svelte/lib/LinkSimple';
  import FileTextIcon from 'phosphor-svelte/lib/FileText';
  import * as Sheet from '$lib/components/ui/sheet';
  import { Button } from '$lib/components/ui/button';
  import WikiTree from '$lib/components/wiki/WikiTree.svelte';
  import WikiSearch from '$lib/components/wiki/WikiSearch.svelte';
  import TableOfContents from '$lib/components/TableOfContents.svelte';
  import UserName from '$lib/components/UserName.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatNumber } from '$lib/format';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const p = $derived(data.page);
  const w = $derived(data.wiki);
  const toc = $derived(extractHeadings(p.html));
  let treeOpen = $state(false);

  async function remove() {
    const ok = await confirmAction({
      title: t('"{title}" silinsin mi?', { title: p.title }),
      description: p.children.length ? t('Alt sayfalar silinmez; bir üst seviyeye taşınır. Sayfa geçmişi de silinir.') : t('Sayfa ve geçmişi kalıcı olarak silinir.'),
      confirmLabel: t('Sil'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/wiki/pages/${p.id}`);
      toast.success(t('Sayfa silindi.'));
      await invalidate('app:wiki');
      await goto(p.breadcrumbs.length ? `/wiki/${p.breadcrumbs[p.breadcrumbs.length - 1]!.path}` : '/wiki');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function copyLink(id?: string) {
    try {
      await navigator.clipboard.writeText(`${location.origin}/wiki/${p.path}${id ? `#${id}` : ''}`);
      toast.success(t('Bağlantı kopyalandı.'));
    } catch {
      /* yoksay */
    }
  }
</script>

<svelte:head>
  <title>{p.title} · {w.title}</title>
  {#if p.summary}<meta name="description" content={p.summary} />{/if}
</svelte:head>

{#snippet sidebar(onnavigate?: () => void)}
  <div class="grid gap-3">
    <a href="/wiki" class="flex items-center gap-2 px-1 font-extrabold"><BookOpenIcon class="size-5 text-primary" weight="duotone" />{w.title}</a>
    <WikiSearch />
    <WikiTree nodes={w.tree} current={p.path} {onnavigate} />
    {#if w.canEdit}<Button href="/wiki/new" variant="outline" size="sm" class="mt-1"><PlusIcon />{t('Yeni sayfa')}</Button>{/if}
  </div>
{/snippet}

<div class="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_14rem] xl:gap-8" data-part="wiki-page">
  <aside class="hidden lg:block">
    <div class="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-1 pb-4">{@render sidebar()}</div>
  </aside>

  <article class="min-w-0">
    <!-- Konum -->
    <nav class="mb-4 flex min-w-0 items-center gap-1 text-sm text-muted-foreground" aria-label={t('Konum')}>
      <button type="button" class="mr-1 flex size-8 shrink-0 items-center justify-center rounded-md border lg:hidden" onclick={() => (treeOpen = true)} aria-label={t('Sayfalar')}><ListIcon class="size-4" /></button>
      <a href="/wiki" class="shrink-0 hover:text-foreground">{w.title}</a>
      {#each p.breadcrumbs as b (b.path)}
        <CaretRightIcon class="size-3 shrink-0 opacity-60" /><a href="/wiki/{b.path}" class="truncate hover:text-foreground">{b.title}</a>
      {/each}
    </nav>

    <header class="grid gap-3 border-b pb-5">
      <div class="flex flex-wrap items-start gap-3">
        <h1 class="flex min-w-0 flex-1 items-center gap-3 text-3xl font-black tracking-tight text-balance sm:text-4xl">
          {#if p.iconNodes}<span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary sm:size-12"><NodeIcon nodes={p.iconNodes} size={26} /></span>{/if}<span class="min-w-0">{p.title}</span>
        </h1>
        <div class="flex flex-wrap gap-1.5">
          {#if p.canEdit}<Button href="/wiki/edit/{p.id}" size="sm"><PencilIcon />{t('Düzenle')}</Button>{/if}
          {#if w.canEdit}<Button href="/wiki/new?parent={p.id}" variant="outline" size="sm"><PlusIcon />{t('Alt sayfa')}</Button>{/if}
          <Button href="/wiki/history/{p.id}" variant="ghost" size="sm" title={t('Sayfa geçmişi')}><ClockIcon />{p.revisionCount}</Button>
          <Button variant="ghost" size="icon-sm" onclick={() => copyLink()} title={t('Bağlantıyı kopyala')}><LinkIcon /></Button>
          {#if p.canManage}<Button variant="ghost" size="icon-sm" class="text-destructive" onclick={remove} title={t('Sil')}><TrashIcon /></Button>{/if}
        </div>
      </div>
      {#if p.summary}<p class="text-lg text-muted-foreground">{p.summary}</p>{/if}
      <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span class="inline-flex items-center gap-1">{t('Son düzenleme')} {#if p.updatedBy}<UserName user={p.updatedBy} class="text-xs font-semibold" />,{/if} <TimeAgo ms={p.updatedAt} /></span>
        <span class="inline-flex items-center gap-1"><EyeIcon class="size-3.5" />{t('{n} görüntülenme', { n: formatNumber(p.views) })}</span>
        {#if p.isLocked}<span class="inline-flex items-center gap-1 font-semibold"><LockIcon class="size-3.5" />{t('Kilitli')}</span>{/if}
        {#if !p.isPublished}<span class="inline-flex items-center gap-1 font-semibold text-warning"><EyeSlashIcon class="size-3.5" />{t('Taslak')}</span>{/if}
      </p>
    </header>

    {#if toc.length > 2}
      <details class="mt-5 rounded-lg border bg-muted/30 px-4 py-3 xl:hidden">
        <summary class="cursor-pointer text-sm font-semibold">{t('İçindekiler')}</summary>
        <TableOfContents items={toc} title="" class="mt-3" />
      </details>
    {/if}

    {#if p.html}
      <div class="prose-forum mt-6 max-w-[78ch] text-[15.5px]" data-part="wiki-body">{@html p.html}</div>
    {:else}
      <p class="mt-6 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{t('Bu sayfa henüz boş.')}{#if p.canEdit} <a href="/wiki/edit/{p.id}" class="font-semibold text-highlight hover:underline">{t('İçerik ekle')}</a>{/if}</p>
    {/if}

    <!-- Alt sayfalar -->
    {#if p.children.length}
      <section class="mt-10 grid gap-3">
        <h2 class="text-sm font-bold tracking-wider text-muted-foreground uppercase">{t('Bu bölümdeki sayfalar')}</h2>
        <div class="grid gap-2.5 sm:grid-cols-2">
          {#each p.children as c (c.path)}
            <a href="/wiki/{c.path}" class="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-base">{#if c.iconNodes}<NodeIcon nodes={c.iconNodes} size={18} class="text-primary" />{:else}<FileTextIcon class="size-4 text-muted-foreground" />{/if}</span>
              <span class="grid min-w-0 gap-0.5"><span class="font-bold group-hover:text-highlight">{c.title}</span>{#if c.summary}<span class="line-clamp-2 text-sm text-muted-foreground">{c.summary}</span>{/if}</span>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Önceki / sonraki -->
    {#if p.prev || p.next}
      <nav class="mt-10 grid gap-3 border-t pt-6 sm:grid-cols-2" aria-label={t('Sayfalar arasında gezinme')}>
        {#if p.prev}
          <a href="/wiki/{p.prev.path}" class="group grid gap-0.5 rounded-xl border px-4 py-3 transition-colors hover:border-primary/40">
            <span class="flex items-center gap-1 text-xs text-muted-foreground"><CaretLeftIcon class="size-3" />{t('Önceki')}</span>
            <span class="truncate font-semibold group-hover:text-highlight">{p.prev.title}</span>
          </a>
        {:else}<span></span>{/if}
        {#if p.next}
          <a href="/wiki/{p.next.path}" class="group grid gap-0.5 rounded-xl border px-4 py-3 text-right transition-colors hover:border-primary/40">
            <span class="flex items-center justify-end gap-1 text-xs text-muted-foreground">{t('Sonraki')}<CaretRightIcon class="size-3" /></span>
            <span class="truncate font-semibold group-hover:text-highlight">{p.next.title}</span>
          </a>
        {/if}
      </nav>
    {/if}
  </article>

  <aside class="hidden xl:block">
    <div class="sticky top-24"><TableOfContents items={toc} /></div>
  </aside>
</div>

<!-- Mobil: sayfa ağacı -->
<Sheet.Root bind:open={treeOpen}>
  <Sheet.Content side="left" class="w-80 overflow-y-auto p-4">
    <Sheet.Header class="sr-only"><Sheet.Title>{t('Wiki sayfaları')}</Sheet.Title></Sheet.Header>
    {@render sidebar(() => (treeOpen = false))}
  </Sheet.Content>
</Sheet.Root>
