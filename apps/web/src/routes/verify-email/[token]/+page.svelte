<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import CircleCheckIcon from 'phosphor-svelte/lib/CheckCircle';
  import CircleXIcon from 'phosphor-svelte/lib/XCircle';
  import { Button } from '$lib/components/ui/button';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import { api, errorMessage } from '$lib/api';
  import { t } from '$lib/i18n.svelte';

  let status = $state<'loading' | 'active' | 'pending_approval' | 'error'>('loading');
  let message = $state('');

  // Doğrulama bir POST isteğiyle yapılır (e-posta tarayıcılarının bağlantı ön izlemesi belirteci harcamasın diye).
  onMount(async () => {
    try {
      const res = await api.post<{ status: 'active' | 'pending_approval' }>('/api/auth/verify-email', { token: page.params.token });
      status = res.status;
      if (res.status === 'active') {
        await invalidateAll();
        setTimeout(() => goto('/?welcome=1', { replaceState: true }), 1500);
      }
    } catch (e) {
      status = 'error';
      message = errorMessage(e);
    }
  });
</script>

<AuthCard title={t('E-posta doğrulama')}>
  <div class="grid justify-items-center gap-4 py-2 text-center">
    {#if status === 'loading'}
      <LoaderIcon class="size-8 animate-spin text-muted-foreground" />
      <p class="text-sm text-muted-foreground">{t('Doğrulanıyor…')}</p>
    {:else if status === 'active'}
      <CircleCheckIcon class="size-10 text-success" />
      <p>{t('E-posta adresiniz doğrulandı. Hoş geldiniz!')}</p>
      <Button href="/">{t('Foruma git')}</Button>
    {:else if status === 'pending_approval'}
      <CircleCheckIcon class="size-10 text-success" />
      <p>{t('E-posta adresiniz doğrulandı. Üyeliğiniz yönetici onayından sonra etkinleşecek.')}</p>
    {:else}
      <CircleXIcon class="size-10 text-destructive" />
      <p>{message}</p>
      <Button href="/login" variant="outline">{t('Giriş sayfası')}</Button>
    {/if}
  </div>
</AuthCard>
