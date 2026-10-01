<script lang="ts">
  import ChatsIcon from 'phosphor-svelte/lib/ChatsTeardrop';
  import NotePencilIcon from 'phosphor-svelte/lib/NotePencil';
  import { Button } from '$lib/components/ui/button';
  import { t } from '$lib/i18n.svelte';
</script>

<div class="grid flex-1 place-content-center justify-items-center gap-3 p-8 text-center">
  <ChatsIcon class="size-10 text-muted-foreground/70" weight="duotone" />
  <p class="max-w-xs text-sm text-muted-foreground">{t('Soldan bir konuşma seç ya da yeni bir mesaj başlat.')}</p>
  <Button href="/messages/new" variant="outline" size="sm"><NotePencilIcon />{t('Yeni mesaj')}</Button>
</div>
