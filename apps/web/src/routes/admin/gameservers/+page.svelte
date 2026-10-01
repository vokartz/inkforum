<script lang="ts">
  import { GAME_SERVER_TYPES, type GameServerStatus, type GameServerType } from '@forum/shared';
  import { invalidate } from '$app/navigation';
  import PageHeaderIcon from 'phosphor-svelte/lib/GameController';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import SaveIcon from 'phosphor-svelte/lib/FloppyDisk';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  interface Row {
    id?: string;
    name: string;
    type: GameServerType;
    host: string;
    port: string;
    joinCode: string;
  }
  let rows = $state<Row[]>([]);
  let statuses = $state<GameServerStatus[]>([]);
  const form = createForm();

  function sync() {
    rows = (data.servers ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      host: s.host,
      port: s.port ? String(s.port) : '',
      joinCode: s.joinCode,
    }));
  }
  sync();
  $effect.pre(sync);

  const TYPES = $derived(
    GAME_SERVER_TYPES.map((v) => ({
      value: v,
      label: { fivem: 'FiveM (GTA V)', minecraft: 'Minecraft (Java)', samp: 'SA-MP / open.mp' }[v],
    })),
  );
  const DEFAULT_PORT: Record<GameServerType, number> = { fivem: 30120, minecraft: 25565, samp: 7777 };

  async function save() {
    const res = await form.submit(
      () =>
        api.put<{ items: GameServerStatus[] }>('/api/admin/gameservers', {
          servers: rows.map((r) => ({
            id: r.id,
            name: r.name,
            type: r.type,
            host: r.host.trim(),
            port: r.port ? Number(r.port) : null,
            joinCode: r.joinCode.trim(),
          })),
        }),
      { success: t('Kaydedildi; durumlar denetlendi.') },
    );
    if (!res) return;
    statuses = res.items;
    await invalidate('app:admin-gameservers');
  }
  const statusOf = (r: Row) => statuses.find((s) => s.id === r.id);
</script>

<PageHeader
  title={t('Oyun sunucuları')}
  description={t(
    'Sunucularınızın canlı durumu ana sayfadaki "Oyun sunucusu durumu" bloğunda gösterilir; dakikada bir yenilenir.',
  )}
  icon={PageHeaderIcon}
/>

{#if data.servers}
  <div class="grid gap-4">
    {#each rows as r, i (i)}
      {@const st = statusOf(r)}
      <Card.Root>
        <Card.Content class="grid gap-4 pt-6">
          <div class="grid gap-4 md:grid-cols-[1fr_12rem]">
            <Field label={t('Ad')} error={form.error(`servers.${i}.name`)}
              ><Input bind:value={r.name} maxlength={60} placeholder={t('ör. Lunar Roleplay')} /></Field
            >
            <Field label={t('Oyun')}><NativeSelect bind:value={r.type} options={TYPES} /></Field>
          </div>
          <div class="grid gap-4 md:grid-cols-[1fr_8rem_12rem]">
            <Field
              label={t('Adres')}
              error={form.error(`servers.${i}.host`)}
              hint={t('Alan adı ya da IP (http:// olmadan).')}
              ><Input bind:value={r.host} placeholder="play.ornek.com" class="font-mono" /></Field
            >
            <Field label={t('Port')} hint={t('Boşsa {port}', { port: DEFAULT_PORT[r.type] })}
              ><Input
                bind:value={r.port}
                inputmode="numeric"
                placeholder={String(DEFAULT_PORT[r.type])}
                class="font-mono"
              /></Field
            >
            {#if r.type === 'fivem'}
              <Field label={t('cfx.re kodu (isteğe bağlı)')} hint={t('cfx.re/join/xxxxxx')}
                ><Input bind:value={r.joinCode} maxlength={20} class="font-mono" /></Field
              >
            {/if}
          </div>
          <div class="flex flex-wrap items-center gap-3">
            {#if st}
              <span
                class={cn(
                  'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold',
                  st.online ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
                )}
              >
                <span class={cn('size-2 rounded-full', st.online ? 'bg-success' : 'bg-destructive')}></span>
                {st.online
                  ? t('Çevrimiçi · {n} oyuncu', {
                      n: `${st.players ?? 0}${st.maxPlayers ? ` / ${st.maxPlayers}` : ''}`,
                    })
                  : t('Yanıt yok')}
              </span>
            {/if}
            <Button
              variant="ghost"
              size="sm"
              class="ml-auto text-destructive"
              onclick={() => (rows = rows.filter((_, k) => k !== i))}><TrashIcon />{t('Kaldır')}</Button
            >
          </div>
        </Card.Content>
      </Card.Root>
    {/each}
    <div class="flex flex-wrap gap-2">
      <Button
        variant="outline"
        disabled={rows.length >= 10}
        onclick={() => (rows = [...rows, { name: '', type: 'fivem', host: '', port: '', joinCode: '' }])}
        ><PlusIcon />{t('Sunucu ekle')}</Button
      >
      <Button onclick={save} disabled={form.submitting}><SaveIcon />{t('Kaydet ve denetle')}</Button>
    </div>
  </div>
{/if}
