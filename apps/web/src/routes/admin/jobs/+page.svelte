<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/Gear';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { api, errorMessage } from '$lib/api';
  import { formatDateTime, formatNumber } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const s = $derived(data.stats);
  let busy = $state(false);

  const taskLabels: Record<string, string> = {
    'jobs.cleanup': 'Eski işleri temizle',
    'groups.expire': 'Süreli grup üyeliklerini bitir',
    'warnings.expire': 'Süresi dolan uyarıları düş',
    'achievements.daily': 'Günlük başarı değerlendirmesi',
    'notifications.prune': 'Eski bildirimleri temizle',
  };

  function interval(ms: number): string {
    const h = ms / 3_600_000;
    return h >= 24 ? t('{n} günde bir', { n: Math.round(h / 24) }) : h >= 1 ? t('{n} saatte bir', { n: Math.round(h) }) : t('{n} dakikada bir', { n: Math.round(ms / 60000) });
  }

  async function run(path: string, success: string) {
    busy = true;
    try {
      const res = await api.post<Record<string, unknown>>(path);
      toast.success(success, { description: JSON.stringify(res) });
      await invalidate('app:admin-jobs');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      busy = false;
    }
  }
</script>

<PageHeader icon={PageHeaderIcon} title={t('İşler ve görevler')} description={t('Arka plan iş kuyruğu (e-posta, başarılar) ve zamanlanmış görevler. Redis gerektirmez; veritabanında çalışır.')}>
  {#snippet actions()}
    <Button size="sm" variant="outline" disabled={busy} onclick={() => run('/api/admin/jobs/retry-failed', t('Başarısız işler yeniden kuyruğa alındı.'))}>{t('Başarısızları tekrar dene')}</Button>
    <Button size="sm" disabled={busy} onclick={() => run('/api/admin/jobs/run-tasks', t('Görevler çalıştırıldı.'))}>{t('Görevleri şimdi çalıştır')}</Button>
  {/snippet}
</PageHeader>

{#if s}
  <div class="mb-6 grid gap-3 sm:grid-cols-4">
    {#each [['pending', 'Bekleyen'], ['running', 'Çalışan'], ['done', 'Tamamlanan'], ['failed', 'Başarısız']] as [key, label] (key)}
      <div class="rounded-xl border bg-card p-4">
        <p class="text-2xl font-semibold tabular-nums {key === 'failed' && s.counts[key] ? 'text-destructive' : ''}">{formatNumber(s.counts[key] ?? 0)}</p>
        <p class="text-xs text-muted-foreground">{t(label!)}</p>
      </div>
    {/each}
  </div>

  <Card.Root class="mb-6">
    <Card.Header>
      <Card.Title class="text-base">{t('Zamanlanmış görevler')}</Card.Title>
      <Card.Description>{t('Paylaşımlı hostinglerde süreç boştayken durabilir; kaçırılan görevler açılışta telafi edilir. İsterseniz cron ile "node dist/cli.js cron" çalıştırabilirsiniz.')}</Card.Description>
    </Card.Header>
    <Card.Content>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>{t('Görev')}</Table.Head>
            <Table.Head>{t('Sıklık')}</Table.Head>
            <Table.Head>{t('Son çalışma')}</Table.Head>
            <Table.Head>{t('Sonraki')}</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each s.tasks as task (task.name)}
            <Table.Row>
              <Table.Cell>
                <div class="grid">
                  <span>{taskLabels[task.name] ? t(taskLabels[task.name]!) : task.name}</span>
                  <span class="font-mono text-xs text-muted-foreground">{task.name}</span>
                </div>
              </Table.Cell>
              <Table.Cell class="text-sm">{interval(task.interval_ms)}</Table.Cell>
              <Table.Cell class="text-sm">
                {#if task.last_run_at}<TimeAgo ms={task.last_run_at} /> · <span class={task.last_status === 'error' ? 'text-destructive' : 'text-success'}>{task.last_status === 'error' ? t('hata') : t('tamam')}</span>{:else}—{/if}
                {#if task.last_error}<p class="text-xs text-destructive">{task.last_error}</p>{/if}
              </Table.Cell>
              <Table.Cell class="text-sm text-muted-foreground">{formatDateTime(task.next_run_at)}</Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card.Content>
  </Card.Root>

  {#if s.failed.length}
    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Başarısız işler')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-2 text-sm">
        {#each s.failed as j (j.id)}
          <div class="rounded-lg border p-2">
            <span class="font-mono text-xs">{j.type} #{j.id}</span>
            <span class="text-xs text-muted-foreground"> · {t('{n} deneme', { n: j.attempts })} · {formatDateTime(j.finished_at)}</span>
            {#if j.last_error}<p class="text-xs text-destructive">{j.last_error}</p>{/if}
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  {/if}
{/if}
