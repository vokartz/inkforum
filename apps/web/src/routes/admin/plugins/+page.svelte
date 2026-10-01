<script lang="ts">
  import { PLUGIN_CATEGORIES, type AdminPlugin, type PluginKey } from '@forum/shared';
  import { invalidate, invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/PuzzlePiece';
  import HouseIcon from 'phosphor-svelte/lib/HouseLine';
  import ShoutIcon from 'phosphor-svelte/lib/ChatCenteredDots';
  import DiscordIcon from 'phosphor-svelte/lib/DiscordLogo';
  import BookIcon from 'phosphor-svelte/lib/BookOpenText';
  import ClipboardIcon from 'phosphor-svelte/lib/ClipboardText';
  import LifebuoyIcon from 'phosphor-svelte/lib/Lifebuoy';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import GearIcon from 'phosphor-svelte/lib/GearSix';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { api, errorMessage } from '$lib/api';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const ICONS: Record<PluginKey, typeof HouseIcon> = { landing: HouseIcon, wiki: BookIcon, applications: ClipboardIcon, tickets: LifebuoyIcon, shoutbox: ShoutIcon, discord: DiscordIcon };

  let q = $state('');
  let filter = $state<'all' | 'on' | 'off'>('all');
  const shown = $derived(
    (data.items ?? []).filter((p) => (filter === 'all' || (filter === 'on') === p.enabled) && (!q.trim() || `${p.name} ${p.description}`.toLocaleLowerCase('tr-TR').includes(q.trim().toLocaleLowerCase('tr-TR')))),
  );
  const activeCount = $derived((data.items ?? []).filter((p) => p.enabled).length);

  let busy = $state<PluginKey | null>(null);
  async function toggle(p: AdminPlugin, enabled: boolean) {
    busy = p.key;
    try {
      await api.put(`/api/admin/plugins/${p.key}`, { enabled });
      toast.success(enabled ? t('"{name}" etkinleştirildi.', { name: t(p.name) }) : t('"{name}" kapatıldı; veriler korunur.', { name: t(p.name) }));
      await invalidate('app:admin-plugins');
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      busy = null;
    }
  }
</script>

<svelte:head><title>{t('Eklentiler · Yönetim')}</title></svelte:head>

<PageHeader icon={PageHeaderIcon} title={t('Eklentiler')} description={t('Forumun özelliklerini ihtiyacına göre aç ya da kapat. Kapatılan eklentinin sayfaları ve menü öğeleri gizlenir; verileri silinmez.')} />

{#if data.items}
  <div class="mb-5 flex flex-wrap items-center gap-2">
    <div class="relative w-full max-w-xs">
      <MagnifyingGlassIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input bind:value={q} placeholder={t('Eklenti ara…')} class="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm outline-none focus:border-ring" />
    </div>
    <div class="flex rounded-lg bg-muted p-1">
      {#each [['all', t('Tümü ({n})', { n: data.items.length })], ['on', t('Etkin ({n})', { n: activeCount })], ['off', t('Kapalı ({n})', { n: data.items.length - activeCount })]] as [v, l] (v)}
        <button type="button" class={cn('rounded-md px-3 py-1.5 text-sm font-semibold transition-colors', filter === v ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')} onclick={() => (filter = v as typeof filter)}>{l}</button>
      {/each}
    </div>
  </div>

  <div class="grid gap-4 lg:grid-cols-2" data-part="plugin-list">
    {#each shown as p (p.key)}
      {@const Icon = ICONS[p.key]}
      <article class={cn('group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-[border-color,box-shadow] duration-300', p.enabled ? 'border-primary/30 shadow-card' : 'opacity-90')}>
        <div class="flex items-start gap-4 p-5">
          <span class={cn('flex size-12 shrink-0 items-center justify-center rounded-xl border transition-colors duration-300', p.enabled ? 'border-primary/25 bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
            <Icon class="size-6" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-bold">{t(p.name)}</h2>
              <span class="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">v{p.version}</span>
              <span class="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{t(PLUGIN_CATEGORIES[p.category])}</span>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">{t(p.description)}</p>
          </div>
          <label class="flex shrink-0 flex-col items-center gap-1">
            <Switch checked={p.enabled} disabled={busy === p.key} onCheckedChange={(v) => toggle(p, v)} aria-label={p.enabled ? t('{name} eklentisini kapat', { name: t(p.name) }) : t('{name} eklentisini aç', { name: t(p.name) })} />
            <span class={cn('text-[11px] font-bold', p.enabled ? 'text-success' : 'text-muted-foreground')}>{p.enabled ? t('Etkin') : t('Kapalı')}</span>
          </label>
        </div>
        <ul class="grid gap-1.5 px-5 pb-4 text-sm">
          {#each p.features as f (f)}<li class="flex items-center gap-2"><CheckIcon class="size-4 shrink-0 text-success" weight="bold" />{t(f)}</li>{/each}
        </ul>
        <div class="mt-auto flex flex-wrap items-center gap-2 border-t bg-muted/30 px-5 py-3">
          {#each p.stats as s (s)}<span class="rounded-full bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border">{s}</span>{/each}
          <span class="ml-auto flex gap-1.5">
            {#if p.enabled && p.publicHref}<Button variant="ghost" size="sm" href={p.publicHref} target="_blank"><ArrowSquareOutIcon />{t('Aç')}</Button>{/if}
            {#if p.enabled && p.adminHref}<Button variant="outline" size="sm" href={p.adminHref}><GearIcon />{t('Yönet')}</Button>{/if}
          </span>
        </div>
      </article>
    {:else}
      <p class="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t('Aramaya uyan eklenti yok.')}</p>
    {/each}
  </div>
{/if}
