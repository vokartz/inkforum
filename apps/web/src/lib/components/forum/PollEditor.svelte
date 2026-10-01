<script lang="ts" module>
  import type { PollShowResults } from '@forum/shared';

  export interface PollDraft {
    question: string;
    options: Array<{ key: number; label: string }>;
    maxChoices: number;
    allowChange: boolean;
    publicVotes: boolean;
    showResults: PollShowResults;
    closesAt: string;
  }

  let seq = 0;
  export const pollOption = (label = '') => ({ key: ++seq, label });
  export const emptyPoll = (): PollDraft => ({
    question: '',
    options: [pollOption(), pollOption()],
    maxChoices: 1,
    allowChange: true,
    publicVotes: false,
    showResults: 'always',
    closesAt: '',
  });

  /** Sunucuya gönderilecek anket (boş seçenekler atılır). */
  export function pollPayload(p: PollDraft) {
    const options = p.options.map((o) => o.label.trim()).filter(Boolean);
    return {
      question: p.question.trim(),
      options,
      maxChoices: Math.min(Math.max(1, p.maxChoices), Math.max(1, options.length)),
      allowChange: p.allowChange,
      publicVotes: p.publicVotes,
      showResults: p.showResults,
      closesAt: p.closesAt ? new Date(p.closesAt).getTime() : null,
    };
  }
</script>

<script lang="ts">
  import { POLL_SHOW_RESULTS, POLL_SHOW_RESULTS_LABELS } from '@forum/shared';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import CaretUpIcon from 'phosphor-svelte/lib/CaretUp';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDown';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { Button } from '$lib/components/ui/button';
  import Field from '../Field.svelte';
  import Combobox from '../Combobox.svelte';
  import { t } from '$lib/i18n.svelte';

  let { poll = $bindable(), maxOptions = 10, errors = {} }: { poll: PollDraft; maxOptions?: number; errors?: Record<string, string> } = $props();

  const filled = $derived(poll.options.filter((o) => o.label.trim()).length);

  function addOption() {
    if (poll.options.length < maxOptions) poll.options = [...poll.options, pollOption()];
  }
  function removeOption(i: number) {
    if (poll.options.length > 2) poll.options = poll.options.filter((_, j) => j !== i);
  }
  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= poll.options.length) return;
    const next = [...poll.options];
    [next[i], next[j]] = [next[j]!, next[i]!];
    poll.options = next;
  }
  function onOptionKey(e: KeyboardEvent, i: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (i === poll.options.length - 1) addOption();
      queueMicrotask(() => document.getElementById(`poll-opt-${i + 1}`)?.focus());
    }
  }
  const minDate = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);
</script>

<div class="grid gap-5" data-part="poll-editor">
  <Field label={t('Soru')} for="poll-q" error={errors['poll.question']}>
    <Input id="poll-q" bind:value={poll.question} maxlength={200} placeholder={t('ör. Bir sonraki etkinlik hangi gün olsun?')} class="h-10 text-base" />
  </Field>

  <div class="grid gap-2">
    <div class="flex items-center justify-between">
      <span class="text-sm font-semibold">{t('Seçenekler')}</span>
      <span class="text-xs text-muted-foreground tabular-nums">{poll.options.length} / {maxOptions}</span>
    </div>
    {#each poll.options as opt, i (opt.key)}
      <div class="flex items-center gap-2 animate-rise">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">{i + 1}</span>
        <Input id="poll-opt-{i}" bind:value={opt.label} maxlength={120} placeholder={t('Seçenek {n}', { n: i + 1 })} onkeydown={(e) => onOptionKey(e, i)} aria-invalid={!!errors[`poll.options.${i}`]} />
        <div class="flex shrink-0">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Yukarı taşı')} disabled={i === 0} onclick={() => move(i, -1)}><CaretUpIcon /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Aşağı taşı')} disabled={i === poll.options.length - 1} onclick={() => move(i, 1)}><CaretDownIcon /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Seçeneği sil')} disabled={poll.options.length <= 2} onclick={() => removeOption(i)}><TrashIcon /></Button>
        </div>
      </div>
      {#if errors[`poll.options.${i}`]}<p class="pl-9 text-xs text-destructive">{errors[`poll.options.${i}`]}</p>{/if}
    {/each}
    {#if errors['poll.options']}<p class="text-xs text-destructive">{errors['poll.options']}</p>{/if}
    <Button type="button" variant="outline" size="sm" class="justify-self-start" onclick={addOption} disabled={poll.options.length >= maxOptions}><PlusIcon />{t('Seçenek ekle')}</Button>
  </div>

  <div class="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
    <Field label={t('Kaç seçenek işaretlenebilir')} error={errors['poll.maxChoices']}>
      <Combobox
        options={Array.from({ length: Math.max(1, filled) }, (_, k) => ({ value: k + 1, label: k === 0 ? t('Yalnızca bir') : t('En fazla {n}', { n: k + 1 }) }))}
        bind:value={poll.maxChoices as never}
        searchable={false}
      />
    </Field>
    <Field label={t('Sonuçlar ne zaman görünsün')}>
      <Combobox options={POLL_SHOW_RESULTS.map((v) => ({ value: v, label: t(POLL_SHOW_RESULTS_LABELS[v]) }))} bind:value={poll.showResults as never} searchable={false} />
    </Field>
    <Field label={t('Bitiş (isteğe bağlı)')} for="poll-close" error={errors['poll.closesAt']} hint={t('Boş bırakılırsa anket açık kalır.')}>
      <Input id="poll-close" type="datetime-local" bind:value={poll.closesAt} min={minDate} />
    </Field>
    <div class="grid content-start gap-3 pt-1 text-sm">
      <label class="flex items-center justify-between gap-3">{t('Oyunu değiştirmeye izin ver')} <Switch bind:checked={poll.allowChange} /></label>
      <label class="flex items-center justify-between gap-3">{t('Kimin neye oy verdiği görünsün')} <Switch bind:checked={poll.publicVotes} /></label>
    </div>
  </div>
</div>
