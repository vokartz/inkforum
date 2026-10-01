<script lang="ts">
  import PageHeaderIcon from 'phosphor-svelte/lib/ClipboardText';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import TrayIcon from 'phosphor-svelte/lib/Tray';
  import LockIcon from 'phosphor-svelte/lib/LockSimple';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { formatDate } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
</script>

<svelte:head><title>{t('Başvuru formları')} · {t('Yönetim')}</title></svelte:head>

<PageHeader icon={PageHeaderIcon} title={t('Başvuru formları')} description={t('Ekip, rol ya da özel grup başvuruları: sorular, gereksinimler, inceleyiciler ve onayda eklenecek grup.')}>
  {#snippet actions()}
    <Button variant="outline" href="/applications/review"><TrayIcon />{t('İnceleme kuyruğu')}</Button>
    <Button href="/admin/applications/new"><PlusIcon weight="bold" />{t('Yeni form')}</Button>
  {/snippet}
</PageHeader>

{#if data.items}
  {#if data.items.length}
    <div class="divide-y overflow-hidden rounded-xl border bg-card">
      {#each data.items as f (f.id)}
        <div class="flex flex-wrap items-center gap-3 px-4 py-3">
          <a href="/admin/applications/{f.id}" class="min-w-0 flex-1">
            <p class="flex items-center gap-2 font-semibold">{f.title}{#if !f.isOpen}<span class="inline-flex items-center gap-1 rounded bg-muted px-1.5 text-[11px] font-bold text-muted-foreground"><LockIcon class="size-3" />{t('Kapalı')}</span>{/if}</p>
            <p class="text-xs text-muted-foreground">/applications/{f.slug} · {t('{n} soru', { n: f.questions.length })} · {t('{n} başvuru', { n: f.totalCount })} · {t('güncelleme {date}', { date: formatDate(f.updatedAt) })}</p>
          </a>
          {#if f.pendingCount}<a href="/applications/review?form={f.id}" class="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">{t('{n} bekliyor', { n: f.pendingCount })}</a>{/if}
          <Button variant="ghost" size="icon-sm" href="/applications/{f.slug}" target="_blank" title={t('Formu aç')}><ArrowSquareOutIcon /></Button>
          <Button variant="outline" size="sm" href="/admin/applications/{f.id}">{t('Düzenle')}</Button>
        </div>
      {/each}
    </div>
  {:else}
    <EmptyState title={t('Henüz başvuru formu yok')} description={t('İlk formu oluşturun: örneğin yetkili başvurusu, çete / oluşum başvurusu, etkinlik ekibi…')}>
      <Button href="/admin/applications/new"><PlusIcon weight="bold" />{t('Form oluştur')}</Button>
    </EmptyState>
  {/if}
{/if}
