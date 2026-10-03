<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import NotePencilIcon from 'phosphor-svelte/lib/NotePencil';
  import BookmarkIcon from 'phosphor-svelte/lib/BookmarkSimple';
  import ChecksIcon from 'phosphor-svelte/lib/Checks';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDown';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { api } from '$lib/api';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { class: className }: { class?: string } = $props();

  const newTopicHref = $derived.by(() => {
    const m = /^\/f\/(\d+)/.exec(page.url.pathname);
    return m ? `/f/${m[1]}/new` : '/new';
  });

  async function markAllRead() {
    await api.post('/api/forum/mark-read');
    await invalidateAll();
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class={cn('inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-colors hover:bg-white/10', className)} data-part="create-menu">
    <PlusIcon class="size-4" weight="bold" />{t('Oluştur')}<CaretDownIcon class="size-3.5 opacity-70" weight="bold" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-56">
    <DropdownMenu.Item onSelect={() => goto(newTopicHref)}><NotePencilIcon />{t('Yeni konu')}</DropdownMenu.Item>
    <DropdownMenu.Separator />
    <DropdownMenu.Item onSelect={() => goto('/unread')}><BookmarkIcon />{t('Okunmamış içerik')}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={markAllRead}><ChecksIcon />{t('Siteyi okundu say')}</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
