<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { t } from '$lib/i18n.svelte';

  const titles: Record<number, string> = {
    400: 'Geçersiz istek',
    401: 'Giriş gerekli',
    403: 'Erişim engellendi',
    404: 'Sayfa bulunamadı',
    429: 'Çok fazla istek',
    500: 'Bir şeyler ters gitti',
    503: 'Hizmet kullanılamıyor',
  };
  const title = $derived(titles[page.status] ? t(titles[page.status]!) : t('Hata'));
</script>

<svelte:head><title>{title}</title></svelte:head>

<div class="mx-auto flex max-w-md flex-col items-center py-16 text-center">
  <p class="text-6xl font-bold text-muted-foreground/40">{page.status}</p>
  <h1 class="mt-4 text-2xl font-semibold">{title}</h1>
  <!-- İstemci yüklemesindeki error(…) mesajları Türkçe kaynak metindir; sunucu mesajları zaten çevrilmiş gelir (katalogda yoksa aynen döner). -->
  <p class="mt-2 text-muted-foreground">{page.error?.message ? t(page.error.message) : t('Beklenmeyen bir hata oluştu.')}</p>
  <div class="mt-6 flex gap-2">
    <Button href="/" variant="outline">{t('Ana sayfa')}</Button>
    <Button onclick={() => history.back()} variant="ghost">{t('Geri dön')}</Button>
  </div>
</div>
