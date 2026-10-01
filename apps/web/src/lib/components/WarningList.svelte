<script lang="ts">
  import type { WarningItem } from '$lib/types';
  import UserName from './UserName.svelte';
  import { formatDate, formatDateTime } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    items: WarningItem[];
    staff?: boolean;
    onrevoke?: (w: WarningItem) => void;
  }
  let { items, staff = false, onrevoke }: Props = $props();
</script>

{#if !items.length}
  <p class="text-sm text-muted-foreground">{t('Uyarı kaydı yok.')}</p>
{:else}
  <div class="grid gap-2">
    {#each items as w (w.id)}
      <div class="rounded-lg border p-3 text-sm {w.isActive ? '' : 'opacity-60'}">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="rounded-md bg-destructive/15 px-2 py-0.5 font-semibold text-destructive tabular-nums">{t('{points} puan', { points: w.points })}</span>
            <span class="font-medium">{w.reason}</span>
          </div>
          <span class="text-xs text-muted-foreground">{formatDateTime(w.createdAt)}</span>
        </div>
        {#if w.messageToUser}<p class="mt-2">{w.messageToUser}</p>{/if}
        <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {#if w.issuedBy}<span>{t('Veren:')} <UserName user={w.issuedBy} /></span>{/if}
          {#if w.revokedAt}
            <span class="text-success">{t('Geri alındı ({date})', { date: formatDate(w.revokedAt) })}{#if staff && w.revokeReason}: {w.revokeReason}{/if}</span>
          {:else if !w.isActive}
            <span>{t('Süresi doldu')}</span>
          {:else if w.expiresAt}
            <span>{t('{date} tarihinde düşecek', { date: formatDate(w.expiresAt) })}</span>
          {:else}
            <span>{t('Süresiz')}</span>
          {/if}
          {#if staff && w.notes}<span class="w-full">{t('Ekip notu: {notes}', { notes: w.notes })}</span>{/if}
          {#if onrevoke && !w.revokedAt}
            <button type="button" class="ml-auto text-primary hover:underline" onclick={() => onrevoke(w)}>{t('Geri al')}</button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}
