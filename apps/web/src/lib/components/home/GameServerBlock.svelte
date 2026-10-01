<script lang="ts">
  import type { GameServerStatus } from '@forum/shared';
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import GameIcon from 'phosphor-svelte/lib/GameController';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import PlayIcon from 'phosphor-svelte/lib/Play';
  import Widget from '../Widget.svelte';
  import { api } from '$lib/api';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  /** Oyun sunucularının canlı durumu (dakikada bir yenilenir) */
  let { title = null }: { title?: string | null } = $props();
  let items = $state<GameServerStatus[]>([]);
  let loaded = $state(false);

  async function load() {
    try {
      items = (await api.get<{ items: GameServerStatus[] }>('/api/gameservers')).items;
    } catch {
      items = [];
    } finally {
      loaded = true;
    }
  }
  onMount(() => {
    void load();
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(), 60_000);
    return () => clearInterval(timer);
  });

  const GAME: Record<GameServerStatus['type'], string> = {
    fivem: 'FiveM',
    minecraft: 'Minecraft',
    samp: 'SA-MP',
  };
  async function copy(s: GameServerStatus) {
    try {
      await navigator.clipboard.writeText(s.address);
      toast.success(t('Adres kopyalandı: {address}', { address: s.address }));
    } catch {
      toast.error(t('Kopyalanamadı.'));
    }
  }
</script>

{#if loaded && items.length}
  <Widget title={title || t('Sunucu durumu')} icon={GameIcon} flush class="animate-rise">
    <ul class="grid gap-2 px-3 pb-1" data-part="gameservers">
      {#each items as s (s.id)}
        {@const pct =
          s.players !== null && s.maxPlayers
            ? Math.min(100, Math.round((s.players / s.maxPlayers) * 100))
            : 0}
        <li class="rounded-xl border bg-surface-2 p-3">
          <div class="flex items-center gap-2">
            <span
              class={cn(
                'size-2.5 shrink-0 rounded-full',
                s.online
                  ? 'bg-success shadow-[0_0_0_3px_color-mix(in_oklab,var(--success)_25%,transparent)]'
                  : 'bg-destructive',
              )}
            ></span>
            <span class="min-w-0 flex-1 truncate text-sm font-bold">{s.name}</span>
            <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground uppercase"
              >{GAME[s.type]}</span
            >
          </div>
          {#if s.online}
            <div class="mt-2 flex items-baseline justify-between text-xs text-muted-foreground">
              <span class="truncate">{s.hostname ?? ''}</span>
              <span class="shrink-0 font-semibold text-foreground tabular-nums"
                >{s.players ?? 0}{#if s.maxPlayers}
                  / {s.maxPlayers}{/if}
                {t('oyuncu')}</span
              >
            </div>
            {#if s.maxPlayers}<div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full bg-primary transition-[width]" style="width:{pct}%"></div>
              </div>{/if}
          {:else}
            <p class="mt-1.5 text-xs text-muted-foreground">
              {t('Sunucu şu an kapalı ya da yanıt vermiyor.')}
            </p>
          {/if}
          <div class="mt-2.5 flex gap-1.5">
            <button
              type="button"
              class="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border bg-background px-2.5 font-mono text-xs transition-colors hover:border-primary"
              onclick={() => copy(s)}
              title={t('Adresi kopyala')}
            >
              <CopyIcon class="size-3.5 shrink-0" /><span class="truncate">{s.address}</span>
            </button>
            {#if s.connectUrl && s.online}
              <a
                href={s.connectUrl}
                class="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"
                ><PlayIcon class="size-3.5" weight="fill" />{t('Bağlan')}</a
              >
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </Widget>
{/if}
