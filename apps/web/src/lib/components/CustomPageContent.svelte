<script lang="ts">
  import type { CustomPageView } from '@forum/shared';
  import { page as appPage } from '$app/state';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import HouseIcon from 'phosphor-svelte/lib/House';
  import ShieldWarningIcon from 'phosphor-svelte/lib/ShieldWarning';
  import CustomHtml from '$lib/components/CustomHtml.svelte';
  import BuilderPage from '$lib/components/builder/BuilderPage.svelte';
  import { Button } from '$lib/components/ui/button';
  import { formatDate } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { page: p, safeMode = false }: { page: CustomPageView; safeMode?: boolean } = $props();
  const viewer = $derived(appPage.data.viewer);
  const canEdit = $derived(!!viewer?.isAdmin);
  // Güvenli modda ya da özel kod kapalıyken HTML sayfaların kodu çalıştırılmaz.
  const blocked = $derived(p.format === 'html' && (safeMode || !p.html));
</script>

<svelte:head>
  <title>{p.isLanding ? viewer?.settings['general.forumName'] : `${p.title} · ${viewer?.settings['general.forumName']}`}</title>
  {#if p.metaDescription}<meta name="description" content={p.metaDescription} />{/if}
</svelte:head>

{#snippet adminBar()}
  {#if canEdit || !p.isPublished}
    <div class="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground" data-part="page-admin-bar">
      {#if !p.isPublished}<span class="inline-flex items-center gap-1.5 font-semibold text-warning"><EyeSlashIcon class="size-4" />{t('Taslak — yalnızca yöneticiler görüyor')}</span>{/if}
      {#if p.isLanding}<span class="inline-flex items-center gap-1.5 font-semibold text-highlight"><HouseIcon class="size-4" />{t('Açılış sayfası')}</span>{/if}
      <span class="text-xs">{t('Son güncelleme {date}', { date: formatDate(p.updatedAt) })}</span>
      {#if canEdit}<Button href="/studio/{p.id}" variant="outline" size="sm" class="ml-auto" data-sveltekit-reload><PencilIcon />{t('Sayfayı düzenle')}</Button>{/if}
    </div>
  {/if}
{/snippet}

{#snippet content()}
  {#if blocked}
    <p class="flex items-center gap-2 rounded-md bg-muted px-4 py-6 text-sm text-muted-foreground"><ShieldWarningIcon class="size-5" />{t('Bu sayfa özel kod içeriyor; güvenli modda ya da özel kod kapalıyken gösterilmez.')}</p>
  {:else if p.format === 'builder'}
    <BuilderPage blocks={p.blocks ?? []} standalone={p.layout === 'blank'} />
  {:else if p.format === 'html'}
    <CustomHtml html={p.html} part="custom-page" />
  {:else}
    <div class="prose-forum">{@html p.html}</div>
  {/if}
{/snippet}

{#if p.layout === 'blank' && p.format !== 'builder'}
  {#if canEdit || !p.isPublished}<div class="mx-auto max-w-5xl px-4 pt-4">{@render adminBar()}</div>{/if}
  {@render content()}
{:else if p.layout === 'wide' || p.format === 'builder'}
  <!-- Sürükle-bırak sayfalar her zaman tam genişlikte; yönetici çubuğu ilk bloğun üstünü kapatmasın diye sağ altta -->
  {#if p.format === 'builder'}
    {#if canEdit || !p.isPublished}
      <div class="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border bg-popover/95 py-1.5 pr-1.5 pl-4 text-xs shadow-lg backdrop-blur" data-part="page-admin-bar">
        {#if !p.isPublished}<span class="font-semibold text-warning">{t('Taslak')}</span>{/if}
        {#if p.isLanding}<span class="font-semibold text-highlight">{t('Açılış sayfası')}</span>{/if}
        {#if canEdit}<Button href="/studio/{p.id}" size="sm" class="rounded-full" data-sveltekit-reload><PencilIcon />{t('Düzenle')}</Button>{/if}
      </div>
    {/if}
  {:else}
    {@render adminBar()}
  {/if}
  {#if p.showTitle && p.format !== 'builder'}<h1 class="mb-5 text-3xl font-extrabold tracking-tight">{p.title}</h1>{/if}
  {@render content()}
{:else}
  <div class="mx-auto max-w-4xl">
    {@render adminBar()}
    <article class="rounded-xl border bg-card px-5 py-6 sm:px-8 sm:py-8" data-part="custom-page-card">
      {#if p.showTitle}<h1 class="mb-5 border-b pb-4 text-3xl font-extrabold tracking-tight">{p.title}</h1>{/if}
      {@render content()}
    </article>
  </div>
{/if}
