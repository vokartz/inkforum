<script lang="ts">
  import { tierName } from '$lib/tiers';
  import StarIcon from 'phosphor-svelte/lib/Star';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import AchievementIcon from '$lib/components/AchievementIcon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const max = $derived(Number(data.viewer.settings['achievements.featuredMax'] ?? 5));
  let featured = $state<number[]>(data.achievements.filter((a) => a.isFeatured).map((a) => a.id));
  const form = createForm();

  function toggle(id: number) {
    if (featured.includes(id)) featured = featured.filter((x) => x !== id);
    else if (featured.length < max) featured = [...featured, id];
  }

  async function save() {
    await form.submit(() => api.put('/api/me/achievements/featured', { achievementIds: featured }), {
      success: t('Öne çıkan başarılarınız kaydedildi.'),
      toastErrors: true,
    });
  }
</script>

<PageHeader title={t('Başarılarım')} description={t('Profilinizde en fazla {max} başarıyı öne çıkarabilirsiniz.', { max })}>
  {#snippet actions()}
    <Button href="/achievements" variant="outline" size="sm">{t('Tüm başarılar')}</Button>
    {#if data.achievements.length}<Button size="sm" onclick={save} disabled={form.submitting}>{t('Kaydet')}</Button>{/if}
  {/snippet}
</PageHeader>

{#if !data.achievements.length}
  <EmptyState title={t('Henüz başarı kazanmadınız')} description={t('Profilinizi tamamlayarak ve toplulukta etkin olarak başarılar kazanabilirsiniz.')} />
{:else}
  <div class="grid gap-3 md:grid-cols-2">
    {#each data.achievements as a (a.id)}
      {@const on = featured.includes(a.id)}
      <button
        type="button"
        class="flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors {on ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/40'}"
        onclick={() => toggle(a.id)}
        aria-pressed={on}
      >
        <AchievementIcon iconUrl={a.iconUrl} tier={a.tier} size={44} />
        <div class="grid min-w-0 flex-1">
          <span class="font-medium">{tc(a.name)}</span>
          <span class="truncate text-xs text-muted-foreground">{tc(a.description)}</span>
          <span class="text-xs text-muted-foreground">{tierName(a.tierLabel)} · {t('{n} puan', { n: a.points })} · <TimeAgo ms={a.awardedAt} /></span>
        </div>
        <StarIcon class="size-5 {on ? 'fill-warning text-warning' : 'text-muted-foreground'}" />
      </button>
    {/each}
  </div>
{/if}
