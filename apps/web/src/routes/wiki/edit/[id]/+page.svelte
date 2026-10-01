<script lang="ts">
  import WikiEditor from '$lib/components/wiki/WikiEditor.svelte';
  import { formatDateTime } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const e = $derived(data.edit);
</script>

<svelte:head><title>{t('{title} düzenleniyor', { title: e.title })} · {data.wiki.title}</title></svelte:head>

{#key e.id}
  <WikiEditor
    tree={data.wiki.tree}
    pageId={e.id}
    canManage={data.wiki.canManage}
    backHref="/wiki/{e.path}"
    notice={data.restore ? t('{date} tarihli sürüm yüklendi; kaydederseniz sayfa bu hâline döner.', { date: formatDateTime(data.restore.createdAt) }) : null}
    initial={{
      title: data.restore?.title ?? e.title,
      slug: e.slug,
      parentId: e.parentId,
      icon: e.icon,
      summary: e.summary,
      body: data.restore?.body ?? e.body,
      isPublished: e.isPublished,
      isLocked: e.isLocked,
      note: data.restore ? t('{date} sürümüne geri dönüldü', { date: formatDateTime(data.restore.createdAt) }) : null,
    }}
  />
{/key}
