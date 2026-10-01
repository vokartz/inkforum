<script lang="ts">
  import type { IconNode } from '@forum/shared';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import * as Popover from '$lib/components/ui/popover';
  import { buttonVariants } from '$lib/components/ui/button';
  import { api } from '$lib/api';
  import { cn } from '$lib/utils';
  import NodeIcon from './NodeIcon.svelte';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    /** Phosphor ikon adı (kebab-case) */
    name?: string | null;
    color?: string | null;
    /** Seçili ikonun SVG düğümleri (önizleme için) */
    nodes?: IconNode | null;
    /** Renk seçimini göster (menü ikonlarında gerekmez) */
    withColor?: boolean;
    onchange?: (v: { name: string; color: string | null; nodes: IconNode }) => void;
    class?: string;
    /** Arama uç noktası (yönetici dışı ekranlar için değiştirilebilir) */
    searchUrl?: string;
  }
  let {
    name = $bindable(null),
    color = $bindable(null),
    nodes = $bindable(null),
    withColor = true,
    onchange,
    class: className,
    searchUrl = '/api/admin/icons',
  }: Props = $props();

  const PALETTE = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#94a3b8'];
  const QUICK = ['chats-circle', 'megaphone', 'lifebuoy', 'hand-waving', 'coffee', 'book-open-text', 'game-controller', 'code', 'music-notes', 'film-slate', 'trophy', 'shield-check'];

  let open = $state(false);
  let query = $state('');
  let results = $state<Array<{ name: string; nodes: IconNode }> | null>(null);
  let loading = $state(false);
  let loadError = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  async function search(q: string) {
    const my = ++seq;
    loading = true;
    try {
      const hits = await api.get<Array<{ name: string; nodes: IconNode }>>(`${searchUrl}?q=${encodeURIComponent(q)}`);
      if (my !== seq) return;
      results = hits;
      loadError = false;
    } catch {
      if (my === seq) loadError = true;
    } finally {
      if (my === seq) loading = false;
    }
  }

  function onInput() {
    clearTimeout(timer);
    timer = setTimeout(() => void search(query), 180);
  }

  function pick(i: { name: string; nodes: IconNode }) {
    name = i.name;
    nodes = i.nodes;
    onchange?.({ name: i.name, color, nodes: i.nodes });
  }

  function setColor(c: string | null) {
    color = c;
    if (name && nodes) onchange?.({ name, color: c, nodes });
  }

  const tint = $derived(color ?? 'var(--primary)');

  // Kayıtlı bir ad var ama önizleme düğümleri yoksa (düzenleme açılışı) sunucudan çözülür.
  $effect(() => {
    const n = name;
    if (!n || nodes) return;
    api
      .get<Array<{ name: string; nodes: IconNode }>>(`${searchUrl}?q=${encodeURIComponent(n)}`)
      .then((hits) => {
        const hit = hits.find((h) => h.name === n);
        if (hit && name === n) nodes = hit.nodes;
      })
      .catch(() => undefined);
  });
</script>

<Popover.Root
  bind:open
  onOpenChange={(v) => {
    if (v && !results) void search('');
  }}
>
  <Popover.Trigger class={cn(buttonVariants({ variant: 'outline' }), 'h-auto gap-3 py-2', className)} data-part="icon-picker">
    <span class="flex size-10 items-center justify-center rounded-xl" style="background:color-mix(in oklch, {tint} 16%, transparent);color:{tint}">
      {#if nodes}<NodeIcon {nodes} size={22} />{:else}<span class="text-xs text-muted-foreground">?</span>{/if}
    </span>
    <span class="grid text-left">
      <span class="text-sm font-medium">{name ?? t('İkon seçin')}</span>
      <span class="text-xs text-muted-foreground">{t('Değiştirmek için tıklayın')}</span>
    </span>
  </Popover.Trigger>
  <Popover.Content align="start" class="w-[23rem] gap-3 p-3">
    <div class="flex items-center gap-2 rounded-lg border px-2.5 focus-within:ring-2 focus-within:ring-ring/40">
      <SearchIcon class="size-4 text-muted-foreground" />
      <input
        bind:value={query}
        oninput={onInput}
        placeholder={t('İngilizce ara: chat, star, shield, game…')}
        class="h-9 w-full bg-transparent text-sm outline-none"
      />
      {#if loading}<LoaderIcon class="size-4 animate-spin text-muted-foreground" />{/if}
    </div>
    {#if !query}
      <div class="flex flex-wrap gap-1">
        {#each QUICK as q (q)}
          <button type="button" class="rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => ((query = q), void search(q))}>
            {q}
          </button>
        {/each}
      </div>
    {/if}
    <div class="h-60 overflow-y-auto rounded-lg border bg-muted/30 p-1.5">
      {#if loadError}
        <p class="p-4 text-center text-sm text-destructive">{t('İkonlar yüklenemedi.')}</p>
      {:else if !results}
        <div class="flex h-full items-center justify-center"><LoaderIcon class="size-5 animate-spin text-muted-foreground" /></div>
      {:else if !results.length}
        <p class="p-4 text-center text-sm text-muted-foreground">{t('Eşleşen ikon yok.')}</p>
      {:else}
        <div class="grid grid-cols-8 gap-1">
          {#each results as i (i.name)}
            <button
              type="button"
              title={i.name}
              aria-label={i.name}
              aria-pressed={name === i.name}
              class={cn(
                'flex aspect-square items-center justify-center rounded-md transition-[background-color,transform] hover:scale-110 hover:bg-accent',
                name === i.name && 'bg-primary text-primary-foreground hover:bg-primary',
              )}
              onclick={() => pick(i)}
            >
              <NodeIcon nodes={i.nodes} size={20} />
            </button>
          {/each}
        </div>
      {/if}
    </div>
    {#if withColor}
      <div class="grid gap-2">
        <span class="text-xs font-medium text-muted-foreground">{t('Renk')} <span class="font-normal">{t('(boş bırakılırsa temanın vurgu rengi)')}</span></span>
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class={cn('size-6 rounded-full border bg-primary', !color && 'ring-2 ring-ring ring-offset-2 ring-offset-popover')}
            title={t('Tema rengi')}
            aria-label={t('Tema rengi')}
            onclick={() => setColor(null)}
          ></button>
          {#each PALETTE as c (c)}
            <button
              type="button"
              class={cn('size-6 rounded-full transition-transform hover:scale-110', color === c && 'ring-2 ring-ring ring-offset-2 ring-offset-popover')}
              style="background:{c}"
              title={c}
              aria-label={c}
              onclick={() => setColor(c)}
            ></button>
          {/each}
          <label class="relative size-6 cursor-pointer overflow-hidden rounded-full border" title={t('Özel renk')}>
            <input type="color" class="absolute inset-0 size-10 -translate-x-2 -translate-y-2 cursor-pointer" value={color ?? '#6366f1'} oninput={(e) => setColor(e.currentTarget.value)} />
          </label>
        </div>
      </div>
    {/if}
  </Popover.Content>
</Popover.Root>
