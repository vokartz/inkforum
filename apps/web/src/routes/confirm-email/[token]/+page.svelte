<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import CircleCheckIcon from 'phosphor-svelte/lib/CheckCircle';
  import CircleXIcon from 'phosphor-svelte/lib/XCircle';
  import { Button } from '$lib/components/ui/button';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import { api, errorMessage } from '$lib/api';
  import { t } from '$lib/i18n.svelte';

  let status = $state<'loading' | 'ok' | 'error'>('loading');
  let message = $state('');

  onMount(async () => {
    try {
      await api.post('/api/auth/email-change/confirm', { token: page.params.token });
      status = 'ok';
      await invalidateAll();
    } catch (e) {
      status = 'error';
      message = errorMessage(e);
    }
  });
</script>

<AuthCard title={t('E-posta değişikliği')}>
  <div class="grid justify-items-center gap-4 py-2 text-center">
    {#if status === 'loading'}
      <LoaderIcon class="size-8 animate-spin text-muted-foreground" />
    {:else if status === 'ok'}
      <CircleCheckIcon class="size-10 text-success" />
      <p>{t('E-posta adresiniz güncellendi.')}</p>
      <Button href="/settings/account">{t('Hesap ayarları')}</Button>
    {:else}
      <CircleXIcon class="size-10 text-destructive" />
      <p>{message}</p>
    {/if}
  </div>
</AuthCard>
