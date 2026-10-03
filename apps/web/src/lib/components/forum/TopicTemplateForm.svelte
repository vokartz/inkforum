<script lang="ts">
  import type { TopicTemplate } from '@forum/shared';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  let { template, answers = $bindable(), errors = {} }: { template: TopicTemplate; answers: Record<string, string | string[]>; errors?: Record<string, string> } = $props();

  function toggle(id: string, option: string, on: boolean) {
    const list = Array.isArray(answers[id]) ? (answers[id] as string[]) : [];
    answers[id] = on ? [...list, option] : list.filter((o) => o !== option);
  }
  const checked = (id: string, option: string) => Array.isArray(answers[id]) && (answers[id] as string[]).includes(option);
  const str = (id: string) => (typeof answers[id] === 'string' ? (answers[id] as string) : '');
</script>

<div class="grid gap-5" data-part="topic-template">
  {#if template.intro}
    <p class="rounded-lg border border-primary/25 bg-primary-soft/60 px-4 py-3 text-sm whitespace-pre-line">{template.intro}</p>
  {/if}
  {#each template.fields as f, i (f.id)}
    {@const err = errors[`answers.${f.id}`]}
    <div class="grid gap-2">
      <div class="flex items-center gap-2">
        <label for="tf-{f.id}" class="text-sm font-semibold">{i + 1}. {f.label}</label>
        {#if f.required}<span class="text-[10px] font-bold tracking-wider text-destructive uppercase">{t('Gerekli')}</span>{/if}
      </div>
      {#if f.type === 'textarea'}
        <Textarea id="tf-{f.id}" value={str(f.id)} oninput={(e) => (answers[f.id] = (e.currentTarget as HTMLTextAreaElement).value)} rows={4} maxlength={10000} placeholder={f.placeholder} aria-invalid={!!err} />
      {:else if f.type === 'select'}
        <NativeSelect
          id="tf-{f.id}"
          bind:value={() => str(f.id), (v) => (answers[f.id] = String(v ?? ''))}
          options={[{ value: '', label: t('Seçin…') }, ...f.options.map((o) => ({ value: o, label: o }))]}
          aria-invalid={!!err}
        />
      {:else if f.type === 'radio'}
        <div class="grid gap-1.5 sm:grid-cols-2" role="radiogroup" aria-labelledby="tf-{f.id}">
          {#each f.options as o (o)}
            <label class={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent', str(f.id) === o && 'border-primary bg-primary-soft')}>
              <input type="radio" name="tf-{f.id}" value={o} checked={str(f.id) === o} onchange={() => (answers[f.id] = o)} class="accent-[var(--primary)]" />{o}
            </label>
          {/each}
        </div>
      {:else if f.type === 'checkbox'}
        <div class="grid gap-1.5 sm:grid-cols-2">
          {#each f.options as o (o)}
            <label class={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent', checked(f.id, o) && 'border-primary bg-primary-soft')}>
              <input type="checkbox" checked={checked(f.id, o)} onchange={(e) => toggle(f.id, o, (e.currentTarget as HTMLInputElement).checked)} class="accent-[var(--primary)]" />{o}
            </label>
          {/each}
        </div>
      {:else}
        <Input
          id="tf-{f.id}"
          type={f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text'}
          value={str(f.id)}
          oninput={(e) => (answers[f.id] = (e.currentTarget as HTMLInputElement).value)}
          maxlength={500}
          placeholder={f.placeholder || (f.type === 'url' ? 'https://' : '')}
          aria-invalid={!!err}
        />
      {/if}
      {#if err}<p class="text-xs text-destructive">{err}</p>{:else if f.hint}<p class="text-xs text-muted-foreground">{f.hint}</p>{/if}
    </div>
  {/each}
</div>
