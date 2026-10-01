<script lang="ts">
  import { tierName } from '$lib/tiers';
  import CheckIcon from 'phosphor-svelte/lib/CheckCircle';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Progress } from '$lib/components/ui/progress';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import AchievementIcon from '$lib/components/AchievementIcon.svelte';
  import { formatDate } from '$lib/format';
  import { t, tc } from '$lib/i18n.svelte';
  import type { CatalogItem } from './+page';

  let { data } = $props();
  const items = $derived(data.catalog.items);
  const earned = $derived(items.filter((i) => i.earnedAt));
  const totalPoints = $derived(earned.reduce((s, i) => s + i.points, 0));

  const groups = $derived.by(() => {
    const cats = [...data.catalog.categories, { id: 0, name: t('Diğer'), description: '', sortOrder: 999 }];
    return cats
      .map((c) => ({ ...c, items: items.filter((i) => (i.categoryId ?? 0) === c.id) }))
      .filter((c) => c.items.length);
  });
</script>

<PageHeader title={t('Başarılar')} description={t('Toplulukta ilerledikçe rozetler kazanın.')}>
  {#if data.viewer.user}
    <p class="mt-2 text-sm">
      <strong>{earned.length}</strong> / {t('{n} başarı', { n: items.length })} · <strong>{totalPoints}</strong> {t('puan')}
    </p>
  {/if}
</PageHeader>

{#snippet card(a: CatalogItem)}
  <div class="flex gap-3 rounded-xl border bg-card p-4 {a.earnedAt ? 'border-success/40' : ''}">
    <AchievementIcon iconUrl={a.iconUrl} tier={a.tier} size={52} locked={!a.earnedAt && a.isHidden} />
    <div class="grid min-w-0 flex-1 content-start gap-1">
      <div class="flex items-center gap-1.5">
        <span class="font-medium">{tc(a.name)}</span>
        {#if a.earnedAt}<CheckIcon class="size-4 text-success" />{/if}
      </div>
      <p class="text-sm text-muted-foreground">{tc(a.description)}</p>
      <p class="text-xs text-muted-foreground">
        {tierName(a.tierLabel)} · {t('{n} puan', { n: a.points })} · {t("üyelerin %{rarity}'i kazandı", { rarity: a.rarity })}
        {#if a.earnedAt}· {formatDate(a.earnedAt)}{/if}
      </p>
      {#if !a.earnedAt && a.progress}
        <div class="mt-1 flex items-center gap-2">
          <Progress value={(a.progress.current / a.progress.target) * 100} class="h-1.5" />
          <span class="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{a.progress.current}/{a.progress.target}</span>
        </div>
      {/if}
    </div>
  </div>
{/snippet}

<Tabs.Root value="all">
  <Tabs.List>
    <Tabs.Trigger value="all">{t('Tümü')}</Tabs.Trigger>
    {#if data.viewer.user}<Tabs.Trigger value="earned">{t('Kazandıklarım ({n})', { n: earned.length })}</Tabs.Trigger>{/if}
  </Tabs.List>
  <Tabs.Content value="all" class="mt-4 grid gap-8">
    {#each groups as c (c.id)}
      <section>
        <h2 class="text-lg font-semibold">{tc(c.name)}</h2>
        {#if c.description}<p class="mb-3 text-sm text-muted-foreground">{tc(c.description)}</p>{/if}
        <div class="grid gap-3 md:grid-cols-2">
          {#each c.items as a (a.id)}{@render card(a)}{/each}
        </div>
      </section>
    {/each}
  </Tabs.Content>
  <Tabs.Content value="earned" class="mt-4">
    {#if earned.length}
      <div class="grid gap-3 md:grid-cols-2">
        {#each earned as a (a.id)}{@render card(a)}{/each}
      </div>
    {:else}
      <p class="text-sm text-muted-foreground">{t('Henüz başarı kazanmadınız.')}</p>
    {/if}
  </Tabs.Content>
</Tabs.Root>
