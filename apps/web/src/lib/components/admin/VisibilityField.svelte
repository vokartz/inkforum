<script lang="ts">
  import { CONTENT_VISIBILITY, CONTENT_VISIBILITY_LABELS, type ContentVisibility } from '@forum/shared';
  import type { GroupDto } from '$lib/types';
  import Field from '../Field.svelte';
  import Combobox from '../Combobox.svelte';
  import { t } from '$lib/i18n.svelte';

  /** Özel sayfa / parçacık görünürlüğü: herkes, üyeler, misafirler ya da seçili gruplar. */
  let {
    visibility = $bindable('all'),
    groupIds = $bindable([]),
    groups,
    error = null,
  }: { visibility?: ContentVisibility; groupIds?: number[]; groups: GroupDto[]; error?: string | null } = $props();

  const options = $derived(CONTENT_VISIBILITY.map((v) => ({ value: v, label: t(CONTENT_VISIBILITY_LABELS[v]) })));
</script>

<div class="grid gap-3">
  <Field label={t('Kimler görsün')}>
    <Combobox {options} bind:value={visibility as never} searchable={false} />
  </Field>
  {#if visibility === 'groups'}
    <Field label={t('Gruplar')} {error}>
      <Combobox
        multiple
        options={groups.filter((g) => g.systemKey !== 'guest').map((g) => ({ value: g.id, label: g.name, color: g.color, swatch: g.color }))}
        bind:value={groupIds as never}
        placeholder={t('Grup seçin')}
        invalid={!!error}
      />
    </Field>
  {/if}
</div>
