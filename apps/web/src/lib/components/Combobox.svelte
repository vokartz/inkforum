<script lang="ts" module>
  export type ComboValue = string | number;

  export interface ComboOption {
    value: ComboValue;
    label: string;
    description?: string | null;
    /** İsim rengi (grup rengi gibi) */
    color?: string | null;
    /** Seçeneğin başındaki renkli nokta */
    swatch?: string | null;
    /** Avatar */
    avatar?: { displayName: string; avatarUrl: string | null; color?: string | null } | null;
    group?: string | null;
    disabled?: boolean;
    /** Arama için ek anahtar kelimeler */
    keywords?: string;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import ChevronsUpDownIcon from 'phosphor-svelte/lib/CaretUpDown';
  import XIcon from 'phosphor-svelte/lib/X';
  import SearchIcon from 'phosphor-svelte/lib/MagnifyingGlass';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import * as Popover from '$lib/components/ui/popover';
  import { canonicalName } from '@forum/shared';
  import { cn } from '$lib/utils';
  import UserAvatar from './UserAvatar.svelte';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    /** Sabit seçenekler (ya da `load` ile uzaktan arama). */
    options?: ComboOption[];
    /** Uzaktan arama: sorguya göre seçenek döner. */
    load?: (query: string) => Promise<ComboOption[]>;
    /** Uzaktan aramada seçili değerlerin etiketleri için başlangıç seçenekleri. */
    selected?: ComboOption[];
    value?: ComboValue | null | ComboValue[];
    multiple?: boolean;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    clearable?: boolean;
    /** Listede olmayan değer eklenebilir (etiket girişi). */
    creatable?: boolean;
    searchable?: boolean;
    disabled?: boolean;
    invalid?: boolean;
    id?: string;
    name?: string;
    ariaLabel?: string;
    maxSelected?: number;
    class?: string;
    onchange?: (value: ComboValue | null | ComboValue[]) => void;
    item?: Snippet<[ComboOption]>;
  }

  let {
    options = [],
    load,
    selected = [],
    value = $bindable(),
    multiple = false,
    placeholder = t('Seçin…'),
    searchPlaceholder = t('Ara…'),
    emptyText = t('Sonuç bulunamadı.'),
    clearable = false,
    creatable = false,
    searchable,
    disabled = false,
    invalid = false,
    id,
    name,
    ariaLabel,
    maxSelected,
    class: className,
    onchange,
    item,
  }: Props = $props();

  let open = $state(false);
  let query = $state('');
  let active = $state(0);
  let loading = $state(false);
  let remote = $state<ComboOption[]>([]);
  let inputEl = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);
  const listId = `cb-${Math.random().toString(36).slice(2, 9)}`;
  /** Görülen tüm seçenekler (seçili etiketleri göstermek için). */
  const known = new Map<string, ComboOption>();
  /** Sayı/metin karışık değerler için tip bağımsız karşılaştırma */
  const same = (a: ComboValue, b: ComboValue) => String(a) === String(b);
  const has = (list: ComboValue[], v: ComboValue) => list.some((x) => same(x, v));

  const values = $derived<ComboValue[]>(
    multiple ? (Array.isArray(value) ? value : []) : value === null || value === undefined || value === '' ? [] : [value as ComboValue],
  );
  const showSearch = $derived(searchable ?? (!!load || creatable || options.length > 7));

  $effect(() => {
    for (const o of [...selected, ...options, ...remote]) known.set(String(o.value), o);
  });

  const selectedOptions = $derived(
    values.map((v) => known.get(String(v)) ?? [...selected, ...options].find((o) => same(o.value, v)) ?? { value: v, label: String(v) }),
  );

  const filtered = $derived.by(() => {
    const source = load ? remote : options;
    if (load || !query.trim()) return source;
    const q = canonicalName(query);
    return source.filter((o) => canonicalName(`${o.label} ${o.description ?? ''} ${o.keywords ?? ''}`).includes(q));
  });
  const canCreate = $derived(
    creatable && !!query.trim() && !filtered.some((o) => canonicalName(o.label) === canonicalName(query)),
  );
  const rows = $derived<Array<ComboOption & { create?: boolean }>>(
    canCreate ? [...filtered, { value: query.trim(), label: query.trim(), create: true }] : filtered,
  );
  const grouped = $derived.by(() => {
    const out: Array<{ group: string | null; items: Array<{ opt: ComboOption & { create?: boolean }; index: number }> }> = [];
    rows.forEach((opt, index) => {
      const g = opt.group ?? null;
      let bucket = out.find((b) => b.group === g);
      if (!bucket) out.push((bucket = { group: g, items: [] }));
      bucket.items.push({ opt, index });
    });
    return out;
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  function runLoad() {
    if (!load) return;
    clearTimeout(timer);
    const q = query;
    loading = true;
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const res = await load!(q);
        if (mine === seq) remote = res;
      } catch {
        if (mine === seq) remote = [];
      } finally {
        if (mine === seq) loading = false;
      }
    }, q ? 220 : 0);
  }

  async function onOpenChange(v: boolean) {
    open = v;
    if (v) {
      query = '';
      active = Math.max(0, rows.findIndex((r) => has(values, r.value)));
      runLoad();
      await tick();
      inputEl?.focus();
      scrollActive();
    }
  }

  function emit(next: ComboValue | null | ComboValue[]) {
    value = next;
    onchange?.(next);
  }

  function choose(opt: ComboOption & { create?: boolean }) {
    if (opt.disabled) return;
    known.set(String(opt.value), opt);
    if (multiple) {
      const cur = values;
      if (has(cur, opt.value)) emit(cur.filter((v) => !same(v, opt.value)));
      else if (!maxSelected || cur.length < maxSelected) emit([...cur, opt.value]);
      query = '';
      if (load) runLoad();
      inputEl?.focus();
    } else {
      emit(opt.value);
      open = false;
    }
  }

  function remove(v: ComboValue, e?: Event) {
    e?.stopPropagation();
    e?.preventDefault();
    if (multiple) emit(values.filter((x) => !same(x, v)));
    else emit(null);
  }

  function scrollActive() {
    listEl?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      let next = active;
      for (let k = 0; k < rows.length; k++) {
        next = (next + dir + rows.length) % rows.length;
        if (!rows[next]!.disabled) break;
      }
      active = next;
      scrollActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = rows[active];
      if (opt) choose(opt);
    } else if (e.key === 'Backspace' && multiple && !query && values.length) {
      remove(values[values.length - 1]!);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      active = e.key === 'Home' ? 0 : rows.length - 1;
      scrollActive();
    }
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void onOpenChange(true);
    } else if (showSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      void onOpenChange(true).then(() => (query = e.key));
    }
  }

  $effect(() => {
    // Sorgu değişince ilk seçilebilir satıra dön.
    void query;
    active = 0;
  });
</script>

<Popover.Root {open} onOpenChange={(v) => void onOpenChange(v)}>
  <Popover.Trigger {disabled}>
    {#snippet child({ props })}
      <div
        {...props}
        {id}
        role="combobox"
        tabindex={disabled ? -1 : 0}
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        onkeydown={onTriggerKey}
        data-part="combobox"
        class={cn(
          'group/cb relative flex min-h-8 w-full cursor-pointer items-center gap-1 rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-left text-sm transition-[border-color,box-shadow] outline-none select-none',
          'hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30',
          'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
          open && 'border-ring ring-3 ring-ring/30',
          disabled && 'pointer-events-none opacity-50',
          className,
        )}
      >
        {#if multiple}
          <div class="flex min-w-0 flex-1 flex-wrap gap-1">
            {#each selectedOptions as opt (opt.value)}
              <span
                class="inline-flex max-w-full animate-in items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-1.5 text-xs font-medium text-secondary-foreground duration-150 fade-in-0 zoom-in-95"
              >
                {#if opt.swatch}<span class="size-2 shrink-0 rounded-full" style="background:{opt.swatch}"></span>{/if}
                <span class="truncate" style={opt.color ? `color:${opt.color}` : undefined}>{opt.label}</span>
                <button
                  type="button"
                  class="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                  aria-label={t('{label} seçimini kaldır', { label: opt.label })}
                  onclick={(e) => remove(opt.value, e)}
                  onkeydown={(e) => e.stopPropagation()}><XIcon class="size-3" /></button
                >
              </span>
            {:else}
              <span class="py-0.5 text-muted-foreground">{placeholder}</span>
            {/each}
          </div>
        {:else if selectedOptions[0]}
          {@const opt = selectedOptions[0]}
          <span class="flex min-w-0 flex-1 items-center gap-2">
            {#if opt.avatar}<UserAvatar user={opt.avatar} size={18} />{/if}
            {#if opt.swatch}<span class="size-2.5 shrink-0 rounded-full" style="background:{opt.swatch}"></span>{/if}
            <span class="truncate" style={opt.color ? `color:${opt.color}` : undefined}>{opt.label}</span>
          </span>
        {:else}
          <span class="flex-1 truncate text-muted-foreground">{placeholder}</span>
        {/if}
        {#if clearable && values.length && !disabled}
          <button
            type="button"
            class="absolute top-1/2 right-7 -translate-y-1/2 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/cb:opacity-100 hover:text-foreground focus-visible:opacity-100"
            aria-label={t('Temizle')}
            onclick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              emit(multiple ? [] : null);
            }}><XIcon class="size-3.5" /></button
          >
        {/if}
        <ChevronsUpDownIcon class="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content align="start" class="w-(--bits-popover-anchor-width) min-w-56 gap-0 overflow-hidden p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
    {#if showSearch}
      <div class="flex items-center gap-2 border-b px-2.5">
        <SearchIcon class="size-4 shrink-0 text-muted-foreground" />
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={runLoad}
          onkeydown={onKeydown}
          placeholder={searchPlaceholder}
          class="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          role="searchbox"
          aria-controls={listId}
          aria-activedescendant={rows.length ? `${listId}-${active}` : undefined}
          autocomplete="off"
        />
        {#if loading}<LoaderIcon class="size-4 shrink-0 animate-spin text-muted-foreground" />{/if}
      </div>
    {:else}
      <!-- Arama kutusu yokken klavye olayları için görünmez odak noktası -->
      <input bind:this={inputEl} class="sr-only" onkeydown={onKeydown} aria-controls={listId} readonly />
    {/if}
    <div bind:this={listEl} id={listId} role="listbox" aria-multiselectable={multiple || undefined} class="max-h-72 overflow-y-auto overscroll-contain p-1">
      {#each grouped as g (g.group)}
        {#if g.group}<div class="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.group}</div>{/if}
        {#each g.items as { opt, index } (String(opt.value) + (opt.create ? ':new' : ''))}
          {@const isSel = !opt.create && has(values, opt.value)}
          <div
            id="{listId}-{index}"
            data-index={index}
            role="option"
            tabindex="-1"
            aria-selected={isSel}
            aria-disabled={opt.disabled || undefined}
            class={cn(
              'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
              index === active && 'bg-accent text-accent-foreground',
              opt.disabled && 'cursor-not-allowed opacity-50',
            )}
            onpointermove={() => (active = index)}
            onclick={() => choose(opt)}
            onkeydown={() => {}}
          >
            {#if opt.create}
              <PlusIcon class="size-4 text-muted-foreground" />
              <span>"<strong>{opt.label}</strong>" {t('ekle')}</span>
            {:else if item}
              {@render item(opt)}
            {:else}
              {#if opt.avatar}<UserAvatar user={opt.avatar} size={22} />{/if}
              {#if opt.swatch}<span class="size-2.5 shrink-0 rounded-full" style="background:{opt.swatch}"></span>{/if}
              <span class="min-w-0 flex-1">
                <span class="block truncate" style={opt.color ? `color:${opt.color}` : undefined}>{opt.label}</span>
                {#if opt.description}<span class="block truncate text-xs text-muted-foreground">{opt.description}</span>{/if}
              </span>
            {/if}
            <CheckIcon class={cn('ml-auto size-4 shrink-0 text-primary transition-opacity', isSel ? 'opacity-100' : 'opacity-0')} />
          </div>
        {/each}
      {:else}
        <div class="px-2 py-6 text-center text-sm text-muted-foreground">
          {#if loading}{t('Aranıyor…')}{:else if load && !query}{t('Aramak için yazmaya başlayın.')}{:else}{emptyText}{/if}
        </div>
      {/each}
    </div>
  </Popover.Content>
</Popover.Root>

{#if name}
  {#each values as v (v)}<input type="hidden" {name} value={v} />{/each}
{/if}
