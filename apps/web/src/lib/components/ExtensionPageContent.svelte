<script lang="ts">
  import type { ExtensionPageView } from '@forum/shared';
  import { page as appPage } from '$app/state';
  import PuzzleIcon from 'phosphor-svelte/lib/PuzzlePiece';
  import CustomHtml from '$lib/components/CustomHtml.svelte';
  import { extMount } from '$lib/extensions';
  import { t } from '$lib/i18n.svelte';

  let { page: p }: { page: ExtensionPageView } = $props();
  const forumName = $derived(String(appPage.data.viewer?.settings['general.forumName'] ?? ''));
  const isAdmin = $derived(!!appPage.data.viewer?.isAdmin);
</script>

<svelte:head>
  <title>{p.title}{forumName ? ` · ${forumName}` : ''}</title>
  {#if p.description}<meta name="description" content={p.description} />{/if}
  {#each p.styles as href (href)}<link rel="stylesheet" {href} />{/each}
</svelte:head>

{#snippet body()}
  {#key p.path}
    <div data-part="ext-page-body" use:extMount={{ ext: p.ext, scripts: p.scripts, data: p.data }}>
      <CustomHtml html={p.html} part="ext-page-html" />
    </div>
  {/key}
{/snippet}

<div data-ext-page={p.ext} class="contents">
  {#if p.layout === 'blank'}
    {@render body()}
  {:else if p.layout === 'wide'}
    {#if p.showTitle}<h1 class="mb-5 text-3xl font-extrabold tracking-tight">{p.title}</h1>{/if}
    {@render body()}
  {:else}
    <article class="mx-auto max-w-4xl rounded-xl border bg-card px-5 py-6 sm:px-8 sm:py-8" data-part="ext-page-card">
      {#if p.showTitle}<h1 class="mb-5 border-b pb-4 text-3xl font-extrabold tracking-tight">{p.title}</h1>{/if}
      {@render body()}
    </article>
  {/if}
  {#if isAdmin && p.layout !== 'blank'}
    <p class="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
      <PuzzleIcon class="size-3.5" />{t('Bu sayfa "{name}" eklentisinden geliyor.', { name: p.extName })}
      <a href="/admin/extensions/{p.ext}" class="font-semibold text-link hover:underline">{t('Eklentiyi yönet')}</a>
    </p>
  {/if}
</div>
