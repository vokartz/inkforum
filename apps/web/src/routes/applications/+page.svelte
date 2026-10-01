<script lang="ts">
  import ClipboardIcon from 'phosphor-svelte/lib/ClipboardText';
  import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRight';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import LockIcon from 'phosphor-svelte/lib/LockSimple';
  import TrayIcon from 'phosphor-svelte/lib/Tray';
  import UsersIcon from 'phosphor-svelte/lib/UsersThree';
  import { Button } from '$lib/components/ui/button';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import StatusPill from '$lib/components/applications/StatusPill.svelte';
  import { reveal } from '$lib/reveal';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const reviewable = $derived(data.forms.filter((f) => f.pendingCount !== null));
  const pendingTotal = $derived(reviewable.reduce((s, f) => s + (f.pendingCount ?? 0), 0));
</script>

<svelte:head><title>{t('Başvurular')} · {data.viewer.settings['general.forumName']}</title></svelte:head>

<div class="grid gap-8" data-part="applications">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="flex items-center gap-3">
      <span class="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><ClipboardIcon class="size-6" weight="duotone" /></span>
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight" data-part="page-title">{t('Başvurular')}</h1>
        <p class="text-sm text-muted-foreground">{t('Ekiplere, rollere ve özel gruplara buradan başvurabilirsin.')}</p>
      </div>
    </div>
    {#if reviewable.length}
      <Button href="/applications/review" variant="outline"><TrayIcon />{t('İnceleme kuyruğu')}{#if pendingTotal}<span class="rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{pendingTotal}</span>{/if}</Button>
    {/if}
  </header>

  {#if data.forms.length}
    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {#each data.forms as f, i (f.id)}
        {@const el = f.eligibility}
        <article class="group flex flex-col gap-4 rounded-2xl border bg-card p-5 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift" use:reveal={i * 60}>
          <div class="flex items-start gap-3">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">{#if f.iconNodes}<NodeIcon nodes={f.iconNodes} size={22} />{:else}<ClipboardIcon class="size-5" weight="duotone" />{/if}</span>
            <div class="min-w-0 flex-1">
              <h2 class="text-lg leading-tight font-bold">{f.title}</h2>
              <p class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>{t('{n} soru', { n: f.questionCount })}</span>
                {#if f.targetGroup}<span class="inline-flex items-center gap-1"><UsersIcon class="size-3.5" /><b style={f.targetGroup.color ? `color:${f.targetGroup.color}` : ''}>{tc(f.targetGroup.name)}</b></span>{/if}
                {#if !f.isOpen}<span class="inline-flex items-center gap-1 font-semibold"><LockIcon class="size-3" />{t('Kapalı')}</span>{/if}
              </p>
            </div>
          </div>
          {#if f.excerpt}<p class="line-clamp-3 text-sm text-muted-foreground">{f.excerpt}</p>{/if}
          <div class="mt-auto flex flex-wrap items-center gap-2 border-t pt-4">
            {#if f.myLatest}
              <a href="/applications/view/{f.myLatest.id}" class="inline-flex items-center gap-2 text-sm hover:underline"><StatusPill status={f.myLatest.status} /><span class="text-xs text-muted-foreground"><TimeAgo ms={f.myLatest.createdAt} /></span></a>
            {:else if el}
              <span class={cn('inline-flex items-center gap-1.5 text-xs font-semibold', el.ok ? 'text-success' : 'text-muted-foreground')}>
                {#if el.ok}<CheckCircleIcon class="size-4" weight="fill" />{t('Başvurabilirsin')}{:else}<LockIcon class="size-4" />{el.blocker ?? t('Gereksinimler karşılanmıyor')}{/if}
              </span>
            {/if}
            {#if f.pendingCount}<span class="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-highlight">{t('{n} bekliyor', { n: f.pendingCount })}</span>{/if}
            <Button href="/applications/{f.slug}" size="sm" class="ml-auto" variant={el?.ok ? 'default' : 'outline'}>{el?.ok ? t('Başvur') : t('İncele')}<ArrowRightIcon /></Button>
          </div>
        </article>
      {/each}
    </section>
  {:else}
    <EmptyState title={t('Açık başvuru yok')} description={t('Şu an başvuru alan bir form bulunmuyor.')} />
  {/if}

  {#if data.mine.length}
    <section class="grid gap-3">
      <h2 class="text-lg font-extrabold">{t('Başvurularım')}</h2>
      <div class="divide-y overflow-hidden rounded-xl border bg-card">
        {#each data.mine as a (a.id)}
          <a href="/applications/view/{a.id}" class="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-row-hover">
            <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{#if a.form.iconNodes}<NodeIcon nodes={a.form.iconNodes} size={16} />{:else}<ClipboardIcon class="size-4" />{/if}</span>
            <span class="min-w-0 flex-1"><b class="block truncate">{a.form.title}</b><span class="text-xs text-muted-foreground">#{a.id} · <TimeAgo ms={a.createdAt} /></span></span>
            <StatusPill status={a.status} />
          </a>
        {/each}
      </div>
    </section>
  {/if}
</div>
