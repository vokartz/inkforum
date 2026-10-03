<script lang="ts">
  import XIcon from 'phosphor-svelte/lib/X';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let {
    label,
    hint = '',
    value = $bindable(''),
    fallback,
    clearable = true,
  }: { label: string; hint?: string; value: string; fallback: string; clearable?: boolean } = $props();
  const shown = $derived(value || fallback);
  let text = $derived(value);
  function commit(v: string) {
    const s = v.trim().toLowerCase();
    if (!s && clearable) value = '';
    else if (/^#[0-9a-f]{6}$/.test(s)) value = s;
    else if (/^[0-9a-f]{6}$/.test(s)) value = `#${s}`;
    text = value;
  }
</script>

<div class="flex items-center gap-3" data-part="color-field">
  <label
    class="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border shadow-sm"
    style="background:{shown}"
    title={label}
  >
    <input
      type="color"
      value={shown}
      oninput={(e) => (value = (e.currentTarget as HTMLInputElement).value)}
      class="absolute inset-0 cursor-pointer opacity-0"
      aria-label={label}
    />
  </label>
  <div class="min-w-0 flex-1">
    <p class="truncate text-sm font-medium">{label}</p>
    {#if hint}<p class="truncate text-[11px] text-muted-foreground">{hint}</p>{/if}
  </div>
  <input
    bind:value={text}
    onchange={() => commit(text)}
    placeholder={fallback}
    class={cn(
      'h-8 w-[5.5rem] rounded-md border bg-background px-2 font-mono text-xs outline-none focus:border-ring',
      !value && 'text-muted-foreground',
    )}
    aria-label={t('{label} (onaltılık)', { label })}
  />
  {#if clearable}
    <button
      type="button"
      class={cn('rounded p-1 text-muted-foreground hover:text-foreground', !value && 'invisible')}
      onclick={() => commit('')}
      title={t('Otomatik')}
      aria-label={t('Otomatik')}><XIcon class="size-3.5" /></button
    >
  {/if}
</div>
