<script lang="ts">
  import WikiEditor from '$lib/components/wiki/WikiEditor.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
</script>

<svelte:head><title>{t('Yeni sayfa')} · {data.wiki.title}</title></svelte:head>

{#if data.canEdit}
  <WikiEditor
    tree={data.wiki.tree}
    canManage={data.wiki.canManage}
    backHref="/wiki"
    initial={{ title: '', slug: '', parentId: data.parentId, icon: null, summary: null, body: '', isPublished: true, isLocked: false, note: null }}
  />
{:else}
  <EmptyState title={t('Yetkiniz yok')} description={t('Wiki sayfası oluşturmak için düzenleme yetkisi gerekir.')} />
{/if}
