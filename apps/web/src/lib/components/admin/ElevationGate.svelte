<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import LockKeyholeIcon from 'phosphor-svelte/lib/LockKey';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import Field from '../Field.svelte';
  import FormMessage from '../FormMessage.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';

  let { twoFactor }: { twoFactor: boolean } = $props();
  let password = $state('');
  let code = $state('');
  const form = createForm();

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const res = await form.submit(() => api.post('/api/auth/elevate', { password, code: code || undefined }));
    if (res) {
      password = code = '';
      await invalidateAll();
    }
  }
</script>

<div class="mx-auto max-w-md py-10">
  <Card.Root>
    <Card.Header class="items-center text-center">
      <div class="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <LockKeyholeIcon class="size-6" />
      </div>
      <Card.Title>{t('Kimliğinizi doğrulayın')}</Card.Title>
      <Card.Description>{t('Yönetim paneline devam etmek için şifrenizi yeniden girin. Bu doğrulama bir süre geçerli kalır.')}</Card.Description>
    </Card.Header>
    <Card.Content>
      <form class="grid gap-4" onsubmit={submit}>
        <FormMessage message={form.message} />
        <Field label={t('Şifre')} for="elev-pw" error={form.error('password')}>
          <Input id="elev-pw" type="password" bind:value={password} autocomplete="current-password" autofocus />
        </Field>
        {#if twoFactor}
          <Field label={t('İki adımlı doğrulama kodu')} for="elev-code" error={form.error('code')}>
            <Input id="elev-code" bind:value={code} autocomplete="one-time-code" />
          </Field>
        {/if}
        <Button type="submit" disabled={form.submitting || !password}>{t('Doğrula')}</Button>
      </form>
    </Card.Content>
  </Card.Root>
</div>
