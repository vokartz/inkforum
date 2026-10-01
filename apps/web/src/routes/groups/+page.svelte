<script lang="ts">
  import UsersIcon from 'phosphor-svelte/lib/Users';
  import LockIcon from 'phosphor-svelte/lib/Lock';
  import DoorOpenIcon from 'phosphor-svelte/lib/DoorOpen';
  import SendIcon from 'phosphor-svelte/lib/PaperPlaneRight';
  import * as Card from '$lib/components/ui/card';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import GroupBadge from '$lib/components/GroupBadge.svelte';
  import { formatNumber } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();

  const staff = $derived(data.groups.filter((g) => g.kind !== 'post_count' && (g.systemKey || g.isProtected)));
  const regular = $derived(data.groups.filter((g) => g.kind === 'regular' && !g.systemKey && !g.isProtected));
  const ranks = $derived(data.groups.filter((g) => g.kind === 'post_count').sort((a, b) => (a.minPosts ?? 0) - (b.minPosts ?? 0)));

  const joinLabel = { free: 'Herkes katılabilir', requestable: 'İstekle katılım', closed: 'Kapalı grup' } as const;
</script>

<PageHeader title={t('Gruplar')} description={t('Topluluktaki ekipler, ilgi grupları ve rütbeler.')} />

{#snippet groupCard(g: (typeof data.groups)[number])}
  <a href="/groups/{g.id}" class="group block">
    <Card.Root class="h-full transition-colors group-hover:border-primary/40">
      <Card.Header>
        <div class="flex items-start justify-between gap-2">
          <GroupBadge group={{ id: g.id, name: g.name, color: g.color, iconUrl: g.iconUrl, iconCount: g.iconCount }} />
          {#if g.isMember}<span class="text-xs font-medium text-success">{t('Üyesiniz')}</span>{/if}
        </div>
        {#if g.description}<Card.Description class="line-clamp-2">{g.description}</Card.Description>{/if}
      </Card.Header>
      <Card.Content class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span class="inline-flex items-center gap-1"><UsersIcon class="size-3.5" />{t('{n} üye', { n: formatNumber(g.memberCount) })}</span>
        {#if g.kind === 'post_count'}
          <span>{t('{n}+ mesaj', { n: formatNumber(g.minPosts) })}</span>
        {:else if g.kind === 'regular'}
          <span class="inline-flex items-center gap-1">
            {#if g.joinType === 'free'}<DoorOpenIcon class="size-3.5" />{:else if g.joinType === 'requestable'}<SendIcon
                class="size-3.5"
              />{:else}<LockIcon class="size-3.5" />{/if}
            {t(joinLabel[g.joinType])}
          </span>
        {/if}
        {#if g.hasPendingRequest}<span class="text-warning">{t('İsteğiniz bekliyor')}</span>{/if}
      </Card.Content>
    </Card.Root>
  </a>
{/snippet}

<div class="grid gap-8">
  {#if staff.length}
    <section>
      <h2 class="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t('Yönetim ekibi')}</h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each staff as g (g.id)}{@render groupCard(g)}{/each}
      </div>
    </section>
  {/if}
  {#if regular.length}
    <section>
      <h2 class="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t('Gruplar')}</h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each regular as g (g.id)}{@render groupCard(g)}{/each}
      </div>
    </section>
  {/if}
  {#if ranks.length}
    <section>
      <h2 class="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t('Rütbeler (mesaj sayısına göre)')}</h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {#each ranks as g (g.id)}{@render groupCard(g)}{/each}
      </div>
    </section>
  {/if}
</div>
