<script lang="ts">
  import type { ApplicationQuestion } from '@forum/shared';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  type Value = string | string[] | number | boolean | null;
  let { q, value = $bindable(null), error = null, index }: { q: ApplicationQuestion; value?: Value; error?: string | null; index: number } = $props();

  const id = $derived(`q-${q.id}`);
  const text = $derived(typeof value === 'string' ? value : '');
  const list = $derived(Array.isArray(value) ? value : []);
  function toggle(opt: string) {
    value = list.includes(opt) ? list.filter((x) => x !== opt) : [...list, opt];
  }
</script>

<div class={cn('grid gap-2 rounded-xl border bg-card p-4 transition-colors sm:p-5', error && 'border-destructive/60')} data-part="application-question">
  <label for={id} class="flex gap-2 font-semibold">
    <span class="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary-soft text-xs font-bold text-highlight tabular-nums">{index + 1}</span>
    <span class="leading-snug">{q.label}{#if q.required}<span class="text-destructive"> *</span>{/if}</span>
  </label>
  {#if q.help}<p class="-mt-1 pl-8 text-sm text-muted-foreground">{q.help}</p>{/if}
  <div class="pl-8">
    {#if q.type === 'text' || q.type === 'url'}
      <Input {id} value={text} oninput={(e) => (value = (e.currentTarget as HTMLInputElement).value)} maxlength={q.maxLength} type={q.type === 'url' ? 'url' : 'text'} placeholder={q.type === 'url' ? 'https://' : ''} aria-invalid={!!error} />
    {:else if q.type === 'textarea'}
      <Textarea {id} value={text} oninput={(e) => (value = (e.currentTarget as HTMLTextAreaElement).value)} rows={5} maxlength={q.maxLength} aria-invalid={!!error} />
      <p class="mt-1 text-right text-xs text-muted-foreground tabular-nums">{text.length}{q.minLength ? ` / ${t('en az {n}', { n: q.minLength })}` : ''} · {t('en fazla {n}', { n: q.maxLength })}</p>
    {:else if q.type === 'number'}
      <Input {id} type="number" value={typeof value === 'number' ? value : ''} oninput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; value = v === '' ? null : Number(v); }} class="w-40" aria-invalid={!!error} />
    {:else if q.type === 'select'}
      <select {id} value={text} onchange={(e) => (value = (e.currentTarget as HTMLSelectElement).value || null)} class="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm" aria-invalid={!!error}>
        <option value="">{t('Seçin…')}</option>
        {#each q.options as o (o)}<option value={o}>{o}</option>{/each}
      </select>
    {:else if q.type === 'radio' || q.type === 'checkboxes'}
      <div class="grid gap-1.5 sm:grid-cols-2">
        {#each q.options as o (o)}
          {@const on = q.type === 'radio' ? value === o : list.includes(o)}
          <button
            type="button"
            onclick={() => (q.type === 'radio' ? (value = o) : toggle(o))}
            class={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors', on ? 'border-primary bg-primary-soft font-semibold' : 'hover:bg-accent')}
            aria-pressed={on}
          >
            <span class={cn('flex size-4 shrink-0 items-center justify-center border-2', q.type === 'radio' ? 'rounded-full' : 'rounded', on ? 'border-primary bg-primary' : 'border-muted-foreground/50')}>
              {#if on}<span class={cn('bg-primary-foreground', q.type === 'radio' ? 'size-1.5 rounded-full' : 'size-2 rounded-[1px]')}></span>{/if}
            </span>{o}
          </button>
        {/each}
      </div>
    {:else if q.type === 'yesno'}
      <div class="flex gap-2">
        {#each [[true, 'Evet'], [false, 'Hayır']] as [v, l] (l)}
          <button type="button" onclick={() => (value = v as boolean)} class={cn('h-9 min-w-24 rounded-lg border px-4 text-sm font-semibold transition-colors', value === v ? 'border-primary bg-primary-soft text-highlight' : 'hover:bg-accent')} aria-pressed={value === v}>{t(String(l))}</button>
        {/each}
      </div>
    {/if}
    {#if error}<p class="mt-1.5 text-sm text-destructive">{error}</p>{/if}
  </div>
</div>
