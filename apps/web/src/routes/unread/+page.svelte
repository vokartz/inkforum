<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import CheckCheckIcon from 'phosphor-svelte/lib/Checks';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import TopicRow from '$lib/components/forum/TopicRow.svelte';
  import PageJump from '$lib/components/forum/PageJump.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { api, errorMessage } from '$lib/api';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const u = $derived(data.unread);
  let marking = $state(false);

  async function markAll() {
    marking = true;
    try {
      await api.post('/api/forum/mark-read');
      toast.success(t('Tüm içerik okundu olarak işaretlendi.'));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      marking = false;
    }
  }
</script>

<PageHeader title={t('Okunmamış içerik')} description={t('Son ziyaretinizden bu yana yeni mesaj yazılan konular.')}>
  {#snippet actions()}
    {#if u.total}<Button variant="outline" onclick={markAll} disabled={marking}><CheckCheckIcon />{t('Tümünü okundu say')}</Button>{/if}
  {/snippet}
</PageHeader>

{#if u.items.length}
  <div class="mb-3 flex justify-end"><PageJump page={u.page} perPage={u.perPage} total={u.total} /></div>
  <section class="overflow-hidden rounded-2xl border bg-card shadow-card">
    <div class="divide-y">
      {#each u.items as topic (topic.id)}
        <TopicRow {topic} board={topic.board} unreadPostId={topic.firstUnreadPostId} />
      {/each}
    </div>
  </section>
  <div class="mt-4 flex justify-end"><PageJump page={u.page} perPage={u.perPage} total={u.total} /></div>
{:else}
  <EmptyState title={t('Okunmamış içerik yok')} description={t('Her şeyi okudunuz. Yeni mesajlar geldiğinde burada görünecek.')}>
    <Button href="/" size="sm" variant="outline">{t('Foruma dön')}</Button>
  </EmptyState>
{/if}
