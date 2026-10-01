<script lang="ts">
  import type { DiscordWidget } from '@forum/shared';
  import { onMount } from 'svelte';
  import BrandIcon from '../BrandIcon.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import { api } from '$lib/api';
  import { formatNumber } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  /** Discord sunucusu: çevrimiçi sayısı, birkaç çevrimiçi üye ve katıl düğmesi */
  let { title = null }: { title?: string | null } = $props();
  let w = $state<DiscordWidget | null>(null);
  let loaded = $state(false);

  onMount(async () => {
    try {
      w = (await api.get<{ widget: DiscordWidget | null }>('/api/discord/widget')).widget;
    } catch {
      w = null;
    } finally {
      loaded = true;
    }
  });
</script>

{#if loaded && w}
  <section
    data-part="discord-block"
    class="animate-rise overflow-hidden rounded-2xl border bg-card shadow-card"
  >
    <div class="flex items-center gap-3 bg-[#5865f2] px-4 py-3.5 text-white">
      <BrandIcon platform="discord" size={26} />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-extrabold">{title || w.name}</p>
        <p class="flex items-center gap-1.5 text-xs text-white/85">
          <span class="size-2 rounded-full bg-[#3ba55d]"></span>{t('{n} çevrimiçi', {
            n: formatNumber(w.online),
          })}
        </p>
      </div>
    </div>
    {#if w.members.length}
      <div class="flex flex-wrap gap-1.5 px-4 pt-3">
        {#each w.members.slice(0, 10) as m (m.name)}
          <span class="relative" title={m.name}>
            <UserAvatar user={{ displayName: m.name, avatarUrl: m.avatarUrl }} size={28} />
            <span
              class="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card {m.status ===
              'online'
                ? 'bg-[#3ba55d]'
                : m.status === 'idle'
                  ? 'bg-[#faa61a]'
                  : 'bg-[#ed4245]'}"
            ></span>
          </span>
        {/each}
      </div>
    {/if}
    {#if w.inviteUrl}
      <div class="p-4">
        <a
          href={w.inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5865f2] text-sm font-bold text-white transition-colors hover:bg-[#4752c4]"
        >
          {t('Sunucuya katıl')}
        </a>
      </div>
    {:else}
      <div class="pb-4"></div>
    {/if}
  </section>
{/if}
