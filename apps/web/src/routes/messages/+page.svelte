<script lang="ts">
  import ChatsIcon from 'phosphor-svelte/lib/ChatsTeardrop';
  import NotePencilIcon from 'phosphor-svelte/lib/NotePencil';
  import { Button } from '$lib/components/ui/button';
  import { t } from '$lib/i18n.svelte';
</script>

<div
  class="grid min-h-[28rem] place-content-center justify-items-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-card"
>
  <span class="flex size-16 items-center justify-center rounded-xl bg-primary-soft text-primary"
    ><ChatsIcon class="size-8" weight="duotone" /></span
  >
  <h2 class="text-lg font-bold">{t('Bir konuşma seç')}</h2>
  <p class="max-w-sm text-sm text-muted-foreground">
    {t(
      'Soldaki listeden bir konuşma aç ya da yeni bir mesaj başlat. Mesajlar yalnızca katılımcılar tarafından görülür.',
    )}
  </p>
  <Button href="/messages/new" variant="outline" class="mt-1"><NotePencilIcon />{t('Yeni mesaj')}</Button>
</div>
