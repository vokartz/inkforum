<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import AuthCard from '$lib/components/AuthCard.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import PolicyCheckList from '$lib/components/PolicyCheckList.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { safeNext } from '$lib/nav';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  let accepted = $state<number[]>([]);
  const form = createForm();

  const allChecked = $derived(data.policies.every((p) => accepted.includes(p.versionId)));

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const res = await form.submit(() => api.post('/api/auth/policies/accept', { policyVersionIds: accepted }));
    if (res) {
      await invalidateAll();
      await goto(safeNext(page.url.searchParams.get('next')), { replaceState: true });
    }
  }
</script>

{#if !data.policies.length}
  <AuthCard title={t('Her şey güncel')}>
    <p class="mb-4 text-sm text-muted-foreground">{t('Onaylamanız gereken bir metin yok.')}</p>
    <Button href="/" class="w-full">{t('Devam et')}</Button>
  </AuthCard>
{:else}
  <AuthCard
    title={t('Güncellenen metinler')}
    wide
    description={t('Foruma devam edebilmek için aşağıdaki güncellenmiş metinleri okuyup onaylamanız gerekiyor.')}
  >
    <form class="grid gap-4" onsubmit={submit}>
      <FormMessage message={form.message} />
      <PolicyCheckList policies={data.policies} bind:accepted errors={form.errors} />
      <Button type="submit" disabled={!allChecked || form.submitting}>
        {form.submitting ? t('Kaydediliyor…') : t('Onayla ve devam et')}
      </Button>
    </form>
  </AuthCard>
{/if}
