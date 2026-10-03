<script lang="ts">
  import PuzzleIcon from 'phosphor-svelte/lib/PuzzlePiece';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import CustomHtml from '$lib/components/CustomHtml.svelte';
  import { extMount } from '$lib/extensions';
  import { installForumClient } from '$lib/extensions';
  import { page } from '$app/state';
  import { browser } from '$app/environment';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const v = $derived(data.view);
  if (browser) {
    const u = page.data.viewer?.user;
    installForumClient({ id: u?.id ?? 0, username: u?.username ?? '', displayName: u?.displayName ?? '', group: u?.primaryGroup?.name ?? null, isGuest: !u, avatarUrl: u?.avatarUrl ?? null });
  }
</script>

<svelte:head>{#each v?.styles ?? [] as href (href)}<link rel="stylesheet" {href} />{/each}</svelte:head>

{#if v}
  <PageHeader icon={PuzzleIcon} title={v.title} description={t('"{name}" eklentisi', { name: v.extName })} />
  {#key `${v.ext}/${v.key}`}
    <div data-ext-admin={v.ext} data-part="ext-admin-page" use:extMount={{ ext: v.ext, scripts: v.scripts, data: v.data }}>
      <CustomHtml html={v.html} part="ext-admin-html" />
    </div>
  {/key}
{/if}
