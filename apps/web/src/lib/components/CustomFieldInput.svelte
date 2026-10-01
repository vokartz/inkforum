<script lang="ts">
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Label } from '$lib/components/ui/label';
  import Field from './Field.svelte';
  import NativeSelect from './NativeSelect.svelte';
  import { t } from '$lib/i18n.svelte';

  interface FieldDef {
    key: string;
    name: string;
    description: string;
    type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'url' | 'number' | 'date';
    options: string[];
    isRequired: boolean;
    maxLength: number;
  }
  let { field, value = $bindable(''), error }: { field: FieldDef; value: string; error?: string } = $props();
  const id = $derived(`cf-${field.key}`);
  let checked = $state(value === '1');
  $effect(() => {
    if (field.type === 'checkbox') value = checked ? '1' : '';
  });
</script>

{#if field.type === 'checkbox'}
  <div class="grid gap-1.5">
    <div class="flex items-center gap-2">
      <Checkbox {id} bind:checked />
      <Label for={id} class="font-normal">{field.name}{#if field.isRequired}<span class="text-destructive"> *</span>{/if}</Label>
    </div>
    {#if error}<p class="text-xs text-destructive">{error}</p>{:else if field.description}<p class="text-xs text-muted-foreground">{field.description}</p>{/if}
  </div>
{:else}
  <Field label={field.name} for={id} {error} hint={field.description || null} required={field.isRequired}>
    {#if field.type === 'textarea'}
      <Textarea {id} bind:value maxlength={field.maxLength} rows={3} aria-invalid={!!error} />
    {:else if field.type === 'select'}
      <NativeSelect {id} bind:value placeholder={t('Seçin…')} options={field.options.map((o) => ({ value: o, label: o }))} aria-invalid={!!error} />
    {:else if field.type === 'radio'}
      <div class="flex flex-wrap gap-3" role="radiogroup">
        {#each field.options as opt (opt)}
          <label class="flex items-center gap-1.5 text-sm">
            <input type="radio" name={id} value={opt} bind:group={value} class="accent-primary" />
            {opt}
          </label>
        {/each}
      </div>
    {:else}
      <Input
        {id}
        bind:value
        type={field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        maxlength={field.maxLength}
        aria-invalid={!!error}
      />
    {/if}
  </Field>
{/if}
