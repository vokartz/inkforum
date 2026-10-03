<script lang="ts">
  import { tagSlug, type TagSummary, type TopicTag } from '@forum/shared';
  import HashIcon from 'phosphor-svelte/lib/Hash';
  import XIcon from 'phosphor-svelte/lib/X';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import { api } from '$lib/api';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let {
    value = $bindable([]),
    max = 5,
    allowNew = true,
    popular = [],
    invalid = false,
    id,
  }: { value?: string[]; max?: number; allowNew?: boolean; popular?: TopicTag[]; invalid?: boolean; id?: string } = $props();

  let text = $state('');
  let focused = $state(false);
  let suggestions = $state<TagSummary[]>([]);
  let active = $state(0);
  let input = $state<HTMLInputElement | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const slugs = $derived(new Set(value.map(tagSlug)));
  const full = $derived(value.length >= max);
  const typedSlug = $derived(tagSlug(text));
  const canCreate = $derived(allowNew && typedSlug.length >= 2 && !slugs.has(typedSlug) && !suggestions.some((s) => s.slug === typedSlug));
  const options = $derived(suggestions.filter((s) => !slugs.has(s.slug)));
  const open = $derived(focused && !full && (options.length > 0 || canCreate));

  $effect(() => {
    const q = text;
    clearTimeout(timer);
    if (!focused) return;
    timer = setTimeout(async () => {
      try {
        suggestions = await api.get<TagSummary[]>(`/api/tags?q=${encodeURIComponent(q.trim())}`);
        active = 0;
      } catch {
        suggestions = [];
      }
    }, 150);
  });

  function add(name: string) {
    const clean = name.trim().replace(/^#/, '').replace(/\s+/g, ' ').slice(0, 24);
    const s = tagSlug(clean);
    if (s.length < 2 || slugs.has(s) || full) return;
    const known = suggestions.find((x) => x.slug === s) ?? popular.find((x) => x.slug === s);
    if (!known && !allowNew) return;
    value = [...value, known?.name ?? clean];
    text = '';
  }
  function remove(i: number) {
    value = value.filter((_, j) => j !== i);
    input?.focus();
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (!text.trim() && e.key !== ',') return;
      e.preventDefault();
      const pick = options[active];
      if (pick && (e.key !== ',' || !canCreate)) add(pick.name);
      else add(text);
    } else if (e.key === 'Backspace' && !text && value.length) {
      value = value.slice(0, -1);
    } else if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      active = Math.min(active + 1, options.length - 1);
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (e.key === 'Escape') {
      focused = false;
    }
  }
</script>

<div class="grid gap-2">
  <div
    class={cn(
      'relative flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20',
      invalid && 'border-destructive',
    )}
    data-part="tag-input"
  >
    {#each value as tag, i (tag)}
      <span class="inline-flex items-center gap-1 rounded-md bg-primary-soft py-0.5 pr-1 pl-2 text-sm font-medium text-highlight animate-pop">
        <HashIcon class="size-3.5 opacity-70" />{tag}
        <button type="button" class="rounded p-0.5 hover:bg-primary/15" aria-label={t('{tag} etiketini kaldır', { tag })} onclick={() => remove(i)}><XIcon class="size-3" /></button>
      </span>
    {/each}
    <input
      bind:this={input}
      bind:value={text}
      {id}
      {onkeydown}
      onfocus={() => (focused = true)}
      onblur={() => setTimeout(() => (focused = false), 150)}
      disabled={full}
      maxlength={24}
      placeholder={full ? t('En fazla {max} etiket', { max }) : value.length ? t('Etiket ekle…') : t('Etiket yazın ve Enter\'a basın')}
      class="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      autocomplete="off"
      role="combobox"
      aria-expanded={open}
      aria-controls="tag-suggestions"
    />
    <span class="px-1 text-[11px] text-muted-foreground tabular-nums">{value.length}/{max}</span>

    {#if open}
      <div id="tag-suggestions" role="listbox" class="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border bg-popover p-1 shadow-lg animate-pop">
        {#each options.slice(0, 8) as s, i (s.id)}
          <button
            type="button"
            role="option"
            aria-selected={i === active}
            class={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm', i === active ? 'bg-accent' : 'hover:bg-accent')}
            onmousedown={(e) => e.preventDefault()}
            onclick={() => add(s.name)}
          >
            <HashIcon class="size-3.5 text-muted-foreground" />
            <span class="flex-1 font-medium">{s.name}</span>
            {#if s.isOfficial}<span class="rounded bg-primary-soft px-1.5 text-[10px] font-bold text-highlight">{t('RESMİ')}</span>{/if}
            <span class="text-xs text-muted-foreground tabular-nums">{t('{n} konu', { n: s.topicCount })}</span>
          </button>
        {/each}
        {#if canCreate}
          <button type="button" class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onmousedown={(e) => e.preventDefault()} onclick={() => add(text)}>
            <PlusIcon class="size-3.5 text-muted-foreground" />{t('Yeni etiket:')} <b>{text.trim()}</b>
          </button>
        {/if}
      </div>
    {/if}
  </div>
  {#if popular.length && !full}
    {@const rest = popular.filter((p) => !slugs.has(p.slug)).slice(0, 8)}
    {#if rest.length}
      <div class="flex flex-wrap items-center gap-1.5 text-xs">
        <span class="text-muted-foreground">{t('Popüler:')}</span>
        {#each rest as p (p.id)}
          <button type="button" class="rounded-md border px-1.5 py-0.5 text-muted-foreground transition-colors hover:border-primary hover:text-foreground" onclick={() => add(p.name)}>#{p.name}</button>
        {/each}
      </div>
    {/if}
  {/if}
</div>
