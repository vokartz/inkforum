<script lang="ts">
  import QuestionIcon from 'phosphor-svelte/lib/Question';
  import SignpostIcon from 'phosphor-svelte/lib/Signpost';
  import SparkleIcon from 'phosphor-svelte/lib/Sparkle';
  import PuzzleIcon from 'phosphor-svelte/lib/PuzzlePiece';
  import BookIcon from 'phosphor-svelte/lib/BookOpen';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { buttonVariants } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { onTour, onNews }: { onTour: () => void; onNews: () => void } = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))} aria-label={t('Yardım')} data-tour="help">
    <QuestionIcon />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-64">
    <DropdownMenu.Item onSelect={onTour}><SignpostIcon />{t('Tanıtım turunu başlat')}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={onNews}><SparkleIcon />{t('Yenilikler')}</DropdownMenu.Item>
    <DropdownMenu.Separator />
    <DropdownMenu.Item onSelect={() => (location.href = '/admin/extensions/docs')}><PuzzleIcon />{t('Eklenti geliştirme rehberi')}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={() => window.open('https://github.com/vokartz/inkforum', '_blank', 'noopener')}><BookIcon />{t('InkForum belgeleri')}</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
