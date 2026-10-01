<script lang="ts">
  import Combobox from './Combobox.svelte';
  import { t } from '$lib/i18n.svelte';

  /**
   * Eski <select> API'siyle uyumlu seçici: arka planda aramalı, klavyeyle kullanılabilen Combobox (Select2 tarzı).
   * Değeri boş dize olan seçenek "yer tutucu" etiketi olarak kullanılır.
   */
  interface Props {
    value?: string | number | null;
    options: Array<{ value: string | number; label: string; disabled?: boolean }>;
    placeholder?: string;
    id?: string;
    name?: string;
    class?: string;
    disabled?: boolean;
    required?: boolean;
    onchange?: () => void;
    'aria-label'?: string;
    'aria-invalid'?: boolean | 'true' | 'false';
  }
  let {
    value = $bindable(),
    options,
    placeholder,
    id,
    name,
    class: className,
    disabled = false,
    onchange,
    'aria-label': ariaLabel,
    'aria-invalid': ariaInvalid,
  }: Props = $props();

  const emptyLabel = $derived(options.find((o) => o.value === '')?.label);
</script>

<Combobox
  {id}
  {name}
  {disabled}
  {ariaLabel}
  class={className}
  options={options.map((o) => ({ value: o.value, label: o.label, disabled: o.disabled }))}
  value={value ?? ''}
  placeholder={placeholder ?? emptyLabel ?? t('Seçin…')}
  invalid={ariaInvalid === true || ariaInvalid === 'true'}
  onchange={(v) => {
    value = (Array.isArray(v) ? v[0] : v) ?? '';
    onchange?.();
  }}
/>
