<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { DEFAULT_GROUPS_PAGE, type GroupsPageConfig } from '@forum/shared';
  import PageHeaderIcon from 'phosphor-svelte/lib/ListNumbers';
  import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUp';
  import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDown';
  import DotsSixIcon from 'phosphor-svelte/lib/DotsSixVertical';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import XIcon from 'phosphor-svelte/lib/X';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SaveBar from '$lib/components/admin/SaveBar.svelte';
  import Field from '$lib/components/Field.svelte';
  import GroupBadge from '$lib/components/GroupBadge.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { formatNumber } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();

  const eligible = $derived(data.groups.filter((g) => g.systemKey !== 'guest' && g.systemKey !== 'member'));
  const byId = $derived(new Map(eligible.map((g) => [g.id, g])));

  function initial(): GroupsPageConfig {
    const cfg = structuredClone(data.config ?? DEFAULT_GROUPS_PAGE);
    const ids = new Set(data.groups.map((g) => g.id));
    cfg.groups = cfg.groups.length
      ? cfg.groups.filter((id) => ids.has(id))
      : data.groups.filter((g) => g.systemKey !== 'guest' && g.systemKey !== 'member').map((g) => g.id);
    return cfg;
  }

  let cfg = $state(untrack(initial));
  let saved = $state(untrack(() => JSON.stringify(initial())));
  const dirty = $derived(JSON.stringify(cfg) !== saved);
  const available = $derived(eligible.filter((g) => !cfg.groups.includes(g.id)));
  const form = createForm();
  let dragIndex = $state<number | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= cfg.groups.length || from === to) return;
    const list = [...cfg.groups];
    const [id] = list.splice(from, 1);
    list.splice(to, 0, id!);
    cfg.groups = list;
  }

  async function save() {
    const res = await form.submit(() => api.put('/api/admin/groups-page', { ...cfg, memberLimit: Number(cfg.memberLimit) }));
    if (!res) return;
    saved = JSON.stringify(cfg);
    toast.success(t('Kaydedildi.'));
    await invalidateAll();
  }
</script>

<svelte:head><title>{t('Gruplar sayfası')}</title></svelte:head>

<PageHeader icon={PageHeaderIcon} title={t('Gruplar sayfası')} description={t('Herkese açık gruplar sayfasında hangi rollerin, hangi sırayla ve üyeleriyle görüneceğini belirleyin.')}>
  {#snippet actions()}<Button href="/groups" target="_blank" variant="outline" size="sm"><ArrowSquareOutIcon />{t('Sayfayı aç')}</Button>{/snippet}
</PageHeader>

{#if data.config}
  <div class="grid max-w-3xl gap-5">
    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Görünüm')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-4">
        <label class="flex items-center justify-between gap-4 text-sm">
          <span class="grid gap-0.5">
            <span class="font-medium">{t('Gruplar sayfası açık')}</span>
            <span class="text-xs text-muted-foreground">{t('Kapalıyken sayfa ve menü bağlantısı ziyaretçilere gizlenir.')}</span>
          </span>
          <Switch bind:checked={cfg.enabled} />
        </label>
        <label class="flex items-center justify-between gap-4 text-sm">
          <span class="grid gap-0.5">
            <span class="font-medium">{t('Üyeleri göster')}</span>
            <span class="text-xs text-muted-foreground">{t('Her grubun üyeleri aynı sayfada listelenir; ayrı üye sayfası yoktur.')}</span>
          </span>
          <Switch bind:checked={cfg.showMembers} />
        </label>
        {#if cfg.showMembers}
          <Field label={t('İlk açılışta gösterilecek üye sayısı')} for="gp-limit" error={form.error('memberLimit')} hint={t('Fazlası "Daha fazla göster" ile aynı sayfada açılır.')}>
            <Input id="gp-limit" type="number" min={1} max={200} class="w-32" bind:value={cfg.memberLimit} />
          </Field>
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title class="text-base">{t('Rol sıralaması')}</Card.Title>
        <Card.Description>{t('Gruplar sayfada bu sırayla görünür. En yetkili rolü en üste koyun; sürükleyerek ya da oklarla sıralayın.')}</Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-4">
        {#if !cfg.groups.length}
          <p class="text-sm text-muted-foreground">{t('Sayfada hiç grup yok. Aşağıdan ekleyin.')}</p>
        {:else}
          <ol class="grid gap-1.5">
            {#each cfg.groups as id, i (id)}
              {@const g = byId.get(id)}
              {#if g}
                <li
                  class="flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5 {dragIndex === i ? 'opacity-50' : ''}"
                  draggable="true"
                  ondragstart={() => (dragIndex = i)}
                  ondragend={() => (dragIndex = null)}
                  ondragover={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== i) {
                      move(dragIndex, i);
                      dragIndex = i;
                    }
                  }}
                >
                  <DotsSixIcon class="size-4 shrink-0 cursor-grab text-muted-foreground" />
                  <span class="w-6 text-right text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                  <GroupBadge group={{ id: g.id, name: g.name, color: g.color, iconUrl: g.iconUrl, iconCount: g.iconCount }} />
                  <span class="hidden text-xs text-muted-foreground sm:inline">{t('{n} üye', { n: formatNumber(g.memberCount) })}</span>
                  {#if g.visibility === 'hidden'}<span class="text-xs text-warning" title={t('Gizli gruplar yalnızca üyelerine ve yöneticilere görünür.')}>{t('gizli')}</span>{/if}
                  <div class="ml-auto flex items-center">
                    <Button variant="ghost" size="icon" class="size-7" disabled={i === 0} onclick={() => move(i, i - 1)} aria-label={t('Yukarı taşı')}><ArrowUpIcon /></Button>
                    <Button variant="ghost" size="icon" class="size-7" disabled={i === cfg.groups.length - 1} onclick={() => move(i, i + 1)} aria-label={t('Aşağı taşı')}
                      ><ArrowDownIcon /></Button
                    >
                    <Button variant="ghost" size="icon" class="size-7" onclick={() => (cfg.groups = cfg.groups.filter((x) => x !== id))} aria-label={t('Sayfadan kaldır')}
                      ><XIcon /></Button
                    >
                  </div>
                </li>
              {/if}
            {/each}
          </ol>
        {/if}
        {#if available.length}
          <div class="grid gap-2 border-t pt-4">
            <div class="text-xs font-medium text-muted-foreground">{t('Sayfada olmayan gruplar')}</div>
            <div class="flex flex-wrap gap-2">
              {#each available as g (g.id)}
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors hover:border-primary/40"
                  onclick={() => (cfg.groups = [...cfg.groups, g.id])}
                >
                  <PlusIcon class="size-3.5" /><span style:color={g.color ?? undefined}>{tc(g.name)}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>

  <SaveBar {dirty} saving={form.submitting} onsave={save} onreset={() => (cfg = JSON.parse(saved))} />
{/if}
