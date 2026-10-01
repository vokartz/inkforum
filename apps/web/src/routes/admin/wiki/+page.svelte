<script lang="ts">
  import type { WikiTreeNode } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import { fly } from 'svelte/transition';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/BookOpenText';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import GearIcon from 'phosphor-svelte/lib/GearSix';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import SaveIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api, errorMessage } from '$lib/api';
  import { t } from '$lib/i18n.svelte';
  import WikiOrderZone, { type OrderNode } from './WikiOrderZone.svelte';

  let { data } = $props();

  const toOrder = (nodes: WikiTreeNode[]): OrderNode[] => nodes.map((n) => ({ id: n.id, title: n.title, iconNodes: n.iconNodes, path: n.path, isPublished: n.isPublished, children: toOrder(n.children) }));
  let tree = $state<OrderNode[]>([]);
  let dirty = $state(false);
  const drag = $state({ active: false });
  $effect.pre(() => {
    tree = toOrder(data.wiki.tree);
    dirty = false;
  });

  let saving = $state(false);
  async function save() {
    const items: Array<{ id: number; parentId: number | null; sortOrder: number }> = [];
    const walk = (nodes: OrderNode[], parentId: number | null) => nodes.forEach((n, i) => (items.push({ id: n.id, parentId, sortOrder: i }), walk(n.children, n.id)));
    walk(tree, null);
    saving = true;
    try {
      await api.put('/api/wiki/order', { items });
      toast.success(t('Wiki düzeni kaydedildi.'));
      await invalidate('app:wiki');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>{t('Wiki · Yönetim')}</title></svelte:head>

<PageHeader icon={PageHeaderIcon} title={t('Wiki')} description={t('Sayfaları sürükleyerek sıralayın; bir sayfayı başka bir sayfanın altına bırakınca alt sayfası olur.')}>
  {#snippet actions()}
    <Button variant="ghost" href="/admin/settings/wiki"><GearIcon />{t('Ayarlar')}</Button>
    <Button variant="outline" href="/wiki" target="_blank"><ArrowSquareOutIcon />{t('Wikiyi aç')}</Button>
    <Button href="/wiki/new"><PlusIcon />{t('Yeni sayfa')}</Button>
  {/snippet}
</PageHeader>

{#if tree.length}
  <div class="max-w-3xl">
    <WikiOrderZone bind:items={tree} {drag} onchange={() => (dirty = true)} />
  </div>
{:else}
  <EmptyState title={t('Henüz wiki sayfası yok')} description={t('İlk sayfayı oluşturun; kurallar, rehberler ve sık sorulan sorular için ideal.')}>
    <Button href="/wiki/new"><PlusIcon />{t('Yeni sayfa')}</Button>
  </EmptyState>
{/if}

{#if dirty}
  <div transition:fly={{ y: 20, duration: 200 }} class="sticky bottom-4 z-20 mt-4 flex max-w-3xl items-center gap-3 rounded-xl border bg-popover px-4 py-2.5 shadow-lg">
    <span class="text-sm">{t('Düzende kaydedilmemiş değişiklikler var.')}</span>
    <Button variant="ghost" size="sm" class="ml-auto" onclick={() => ((tree = toOrder(data.wiki.tree)), (dirty = false))}>{t('Vazgeç')}</Button>
    <Button size="sm" onclick={save} disabled={saving}>{#if saving}<LoaderIcon class="animate-spin" />{:else}<SaveIcon />{/if}{t('Kaydet')}</Button>
  </div>
{/if}
