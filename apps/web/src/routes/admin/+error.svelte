<script lang="ts">
  import { page } from '$app/state';
  import ElevationGate from '$lib/components/admin/ElevationGate.svelte';
  import { Button } from '$lib/components/ui/button';
  import { t } from '$lib/i18n.svelte';
</script>

{#if page.error?.code === 'ELEVATION_REQUIRED'}
  <ElevationGate twoFactor={!!page.data.viewer?.user?.twoFactorEnabled} />
{:else}
  <div class="py-16 text-center">
    <p class="text-5xl font-bold text-muted-foreground/40">{page.status}</p>
    <p class="mt-3 text-lg font-medium">{page.error?.message ? t(page.error.message) : t('Bir hata oluştu.')}</p>
    <Button href="/admin" variant="outline" class="mt-6">{t('Panoya dön')}</Button>
  </div>
{/if}
