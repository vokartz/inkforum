<script lang="ts">
  import { CONTENT_VISIBILITY_LABELS, PAGE_LAYOUT_INFO, type AdminCustomPage } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import FilesIcon from 'phosphor-svelte/lib/Files';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimple';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import DotsIcon from 'phosphor-svelte/lib/DotsThreeVertical';
  import CodeIcon from 'phosphor-svelte/lib/Code';
  import TextIcon from 'phosphor-svelte/lib/TextAa';
  import * as Table from '$lib/components/ui/table';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();

  async function remove(p: AdminCustomPage) {
    if (!(await confirmAction({
        title: t('"{title}" silinsin mi?', { title: p.title }),
        description: t('/pages/{slug} adresi artık açılmaz. Menüdeki bağlantıları da kaldırmayı unutmayın.', { slug: p.slug }),
        confirmLabel: t('Sil'),
        destructive: true,
      })))
      return;
    try {
      await api.delete(`/api/admin/pages/${p.id}`);
      toast.success(t('Sayfa silindi.'));
      await invalidate('app:admin-pages');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<svelte:head><title>{t('Özel sayfalar')} · {t('Yönetim')}</title></svelte:head>

<PageHeader
  title={t('Özel sayfalar')}
  description={t('Kurallar rehberi, UCP, başvuru, etkinlik takvimi gibi kendi sayfalarını oluştur. Menüye eklemek için Görünüm → Üst menü.')}
  icon={FilesIcon}
>
  {#snippet actions()}
    <Button href="/studio/new"><PlusIcon weight="bold" />{t('Yeni sayfa')}</Button>
  {/snippet}
</PageHeader>

{#if data.pages}
  {#if data.pages.length}
    <div class="overflow-hidden rounded-xl border bg-card">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>{t('Sayfa')}</Table.Head>
            <Table.Head class="hidden md:table-cell">{t('Tür')}</Table.Head>
            <Table.Head class="hidden md:table-cell">{t('Düzen')}</Table.Head>
            <Table.Head class="hidden lg:table-cell">{t('Görünürlük')}</Table.Head>
            <Table.Head>{t('Durum')}</Table.Head>
            <Table.Head class="hidden sm:table-cell">{t('Güncelleme')}</Table.Head>
            <Table.Head class="w-10"></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.pages as p (p.id)}
            <Table.Row>
              <Table.Cell>
                <a href="/studio/{p.id}" class="grid">
                  <span class="font-semibold hover:underline">{p.title}</span>
                  <span class="font-mono text-xs text-muted-foreground">/pages/{p.slug}</span>
                </a>
              </Table.Cell>
              <Table.Cell class="hidden md:table-cell">
                <span class="inline-flex items-center gap-1.5 text-sm">
                  {#if p.format === 'html'}<CodeIcon class="size-4 text-muted-foreground" />HTML{:else}<TextIcon class="size-4 text-muted-foreground" />BBCode{/if}
                </span>
              </Table.Cell>
              <Table.Cell class="hidden text-sm md:table-cell">{t(PAGE_LAYOUT_INFO[p.layout].label)}</Table.Cell>
              <Table.Cell class="hidden text-sm lg:table-cell">{t(CONTENT_VISIBILITY_LABELS[p.visibility])}</Table.Cell>
              <Table.Cell>
                {#if p.isPublished}<span class="rounded-md bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">{t('Yayında')}</span>
                {:else}<span class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{t('Taslak')}</span>{/if}
              </Table.Cell>
              <Table.Cell class="hidden text-sm text-muted-foreground sm:table-cell"><TimeAgo ms={p.updatedAt} /></Table.Cell>
              <Table.Cell>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    {#snippet child({ props })}<Button {...props} variant="ghost" size="icon-sm" aria-label={t('İşlemler')}><DotsIcon weight="bold" /></Button>{/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end">
                    <DropdownMenu.Item onSelect={() => window.open(`/pages/${p.slug}`, '_blank')}><ArrowSquareOutIcon />{t('Görüntüle')}</DropdownMenu.Item>
                    {#if p.format !== 'html' || data.canCode}
                      <DropdownMenu.Item onSelect={() => (location.href = `/studio/${p.id}`)}><PencilIcon />{t('Düzenle')}</DropdownMenu.Item>
                      <DropdownMenu.Item variant="destructive" onSelect={() => remove(p)}><TrashIcon />{t('Sil')}</DropdownMenu.Item>
                    {/if}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {:else}
    <EmptyState
      title={t('Henüz özel sayfa yok')}
      description={t('BBCode ile içerik sayfası ya da HTML ile tamamen kendi tasarımın (UCP, açılış sayfası) olan sayfalar oluşturabilirsin.')}
    >
      <Button href="/studio/new"><PlusIcon weight="bold" />{t('İlk sayfayı oluştur')}</Button>
    </EmptyState>
  {/if}
{/if}
