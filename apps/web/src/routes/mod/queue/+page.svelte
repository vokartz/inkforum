<script lang="ts">
  import type { ModQueueItem } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import XIcon from 'phosphor-svelte/lib/X';
  import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlash';
  import ChatIcon from 'phosphor-svelte/lib/ChatCircleText';
  import FileIcon from 'phosphor-svelte/lib/FileText';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PageJump from '$lib/components/forum/PageJump.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { counters } from '$lib/counters.svelte';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const q = $derived(data.queue);
  let busy = $state<number | null>(null);

  async function done(message: string) {
    toast.success(message);
    await invalidate('app:mod-queue');
    void counters.refresh();
  }

  async function approve(item: ModQueueItem) {
    busy = item.postId;
    try {
      await api.post(`/api/posts/${item.postId}/approve`);
      await done(item.isTopic ? t('Konu onaylandı.') : t('Mesaj onaylandı.'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      busy = null;
    }
  }

  async function reject(item: ModQueueItem) {
    const ok = await confirmAction({
      title: item.isTopic ? t('Konu reddedilsin mi?') : t('Mesaj reddedilsin mi?'),
      description: item.isTopic ? t('Konu silinir; yetkililer silinen içerikten geri getirebilir.') : t('Mesaj silinir; yetkililer silinen içerikten geri getirebilir.'),
      confirmLabel: t('Reddet'),
      destructive: true,
    });
    if (!ok) return;
    busy = item.postId;
    try {
      await api.delete(`/api/posts/${item.postId}`);
      await done(item.isTopic ? t('Konu reddedildi.') : t('Mesaj reddedildi.'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      busy = null;
    }
  }
</script>

<svelte:head><title>{t('Onay kuyruğu')}</title></svelte:head>

<PageHeader title={t('Onay kuyruğu')} description={t('Onay gerektiren bölümlerde açılan konular ve yazılan mesajlar burada bekler. Onayladığınızda herkese görünür olur.')} />

{#if q.items.length}
  <div class="mb-3 flex items-center justify-between gap-3">
    <p class="text-sm text-muted-foreground">{t('{n} içerik onay bekliyor', { n: q.total })}</p>
    <PageJump page={q.page} perPage={q.perPage} total={q.total} />
  </div>
  <ul class="grid gap-3">
    {#each q.items as item (item.postId)}
      <li class="rounded-2xl border bg-card p-4 shadow-card sm:p-5">
        <div class="flex flex-wrap items-start gap-3">
          <UserAvatar user={item.author ?? { displayName: item.authorName, avatarUrl: null }} size={40} />
          <div class="grid min-w-0 flex-1 gap-1">
            <div class="flex flex-wrap items-center gap-2">
              <Badge variant="outline" class="gap-1">
                {#if item.isTopic}<FileIcon class="size-3.5" />{t('Yeni konu')}{:else}<ChatIcon class="size-3.5" />{t('Yanıt')}{/if}
              </Badge>
              {#if item.isHidden}<Badge variant="secondary" class="gap-1"><EyeSlashIcon class="size-3.5" />{t('Gizli')}</Badge>{/if}
              <a href="/f/{item.board.id}/{item.board.slug}" class="text-xs font-medium text-muted-foreground hover:text-foreground">{tc(item.board.name)}</a>
            </div>
            <a href={item.isTopic ? `/t/${item.topicId}/${item.topicSlug}` : `/p/${item.postId}`} class="truncate text-base font-bold hover:text-highlight">{item.topicTitle}</a>
            <p class="text-xs text-muted-foreground">{item.author?.displayName ?? item.authorName} · <TimeAgo ms={item.createdAt} /></p>
          </div>
          <div class="flex gap-2">
            <Button size="sm" onclick={() => approve(item)} disabled={busy === item.postId}><CheckIcon />{t('Onayla')}</Button>
            <Button size="sm" variant="outline" class="text-destructive hover:text-destructive" onclick={() => reject(item)} disabled={busy === item.postId}><XIcon />{t('Reddet')}</Button>
          </div>
        </div>
        {#if item.excerpt}<p class="mt-3 line-clamp-4 rounded-lg bg-muted/40 px-3 py-2 text-sm whitespace-pre-line text-foreground/90">{item.excerpt}</p>{/if}
      </li>
    {/each}
  </ul>
  <div class="mt-4 flex justify-end"><PageJump page={q.page} perPage={q.perPage} total={q.total} /></div>
{:else}
  <EmptyState title={t('Onay bekleyen içerik yok')} description={t('Yeni konular ve mesajlar onay gerektiğinde burada görünecek.')}>
    <Button href="/" size="sm" variant="outline">{t('Foruma dön')}</Button>
  </EmptyState>
{/if}
