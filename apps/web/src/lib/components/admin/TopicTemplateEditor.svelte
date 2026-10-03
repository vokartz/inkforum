<script lang="ts">
  import type { TopicFieldType, TopicTemplate, TopicTemplateField } from '@forum/shared';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUp';
  import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDown';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import Field from '$lib/components/Field.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import TopicTemplateForm from '$lib/components/forum/TopicTemplateForm.svelte';
  import EyeIcon from 'phosphor-svelte/lib/Eye';
  import { t } from '$lib/i18n.svelte';

  let { value = $bindable(), errors = {} }: { value: TopicTemplate; errors?: Record<string, string> } = $props();

  const TYPES: Array<{ value: TopicFieldType; label: string }> = $derived([
    { value: 'text', label: t('Kısa yanıt') },
    { value: 'textarea', label: t('Uzun yanıt (paragraf)') },
    { value: 'number', label: t('Sayı') },
    { value: 'url', label: t('Bağlantı (URL)') },
    { value: 'select', label: t('Açılır liste (tek seçim)') },
    { value: 'radio', label: t('Seçenekler (tek seçim)') },
    { value: 'checkbox', label: t('Onay kutuları (çoklu seçim)') },
  ]);
  const choice = (type: TopicFieldType) => type === 'select' || type === 'radio' || type === 'checkbox';

  function nextId(): string {
    let i = value.fields.length + 1;
    while (value.fields.some((f) => f.id === `q${i}`)) i++;
    return `q${i}`;
  }

  function add() {
    const field: TopicTemplateField = { id: nextId(), label: '', hint: '', type: 'text', required: true, options: [], placeholder: '' };
    value.fields = [...value.fields, field];
  }
  function remove(i: number) {
    value.fields = value.fields.filter((_, k) => k !== i);
  }
  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= value.fields.length) return;
    const list = [...value.fields];
    [list[i], list[j]] = [list[j]!, list[i]!];
    value.fields = list;
  }
  function cleanId(raw: string): string {
    const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
    return raw
      .toLocaleLowerCase('tr-TR')
      .replace(/[çğıöşü]/g, (c) => map[c] ?? c)
      .replace(/[^a-z0-9_]+/g, '_')
      .slice(0, 32);
  }
  const err = (i: number, key: string) => errors[`topicTemplate.fields.${i}.${key}`] ?? null;
  let preview = $state(false);
  let previewAnswers = $state<Record<string, string | string[]>>({});
  const optionsText = (f: TopicTemplateField) => f.options.join('\n');
  function setOptions(f: TopicTemplateField, text: string) {
    f.options = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
  }
</script>

<div class="grid gap-4">
  <label class="flex items-start gap-3 text-sm">
    <Switch bind:checked={value.enabled} class="mt-0.5" />
    <span>{t('Konu şablonunu kullan')}<span class="block text-xs text-muted-foreground">{t('Üyeler bu bölümde konu açarken aşağıdaki soruları yanıtlar; konu yanıtlardan otomatik oluşturulur.')}</span></span>
  </label>

  {#if value.enabled}
    <Field label={t('Açıklama')} hint={t('Formun üstünde gösterilir (ör. başvuru kuralları). BBCode kullanılmaz, düz metindir.')}>
      <Textarea bind:value={value.intro} rows={3} maxlength={2000} />
    </Field>
    <Field label={t('Başlık şablonu')} hint={t('Boş bırakırsanız üye başlığı kendisi yazar. Yanıtları {q1}, üyenin adını {user} ile ekleyin. Örn: {user} — Yetkili başvurusu')} error={errors['topicTemplate.titleTemplate'] ?? null}>
      <Input bind:value={value.titleTemplate} maxlength={150} placeholder={t('Örn: {user} — Yetkili başvurusu')} />
    </Field>
    <label class="flex items-start gap-3 text-sm">
      <Switch bind:checked={value.allowMessage} class="mt-0.5" />
      <span>{t('Sorulardan sonra serbest mesaj alanı göster')}</span>
    </label>

    <div class="grid gap-3">
      {#each value.fields as f, i (i)}
        <div class="grid gap-3 rounded-xl border bg-muted/20 p-3">
          <div class="flex items-center gap-2">
            <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary tabular-nums">{i + 1}</span>
            <Input bind:value={f.label} placeholder={t('Soru (ör. Oyundaki adın nedir?)')} maxlength={150} class="flex-1" aria-invalid={!!err(i, 'label')} />
            <Button variant="ghost" size="icon-sm" disabled={i === 0} onclick={() => move(i, -1)} title={t('Yukarı taşı')}><ArrowUpIcon /></Button>
            <Button variant="ghost" size="icon-sm" disabled={i === value.fields.length - 1} onclick={() => move(i, 1)} title={t('Aşağı taşı')}><ArrowDownIcon /></Button>
            <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => remove(i)} title={t('Kaldır')}><TrashIcon /></Button>
          </div>
          {#if err(i, 'label')}<p class="-mt-1.5 text-xs text-destructive" role="alert">{err(i, 'label')}</p>{/if}
          <div class="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <Field label={t('Yanıt türü')}>
              <NativeSelect bind:value={f.type} options={TYPES} />
            </Field>
            <Field label={t('Alan kimliği')} error={err(i, 'id')} hint={t('Başlık şablonunda: {code}', { code: `{${f.id || 'q1'}}` })}>
              <Input value={f.id} oninput={(e) => (f.id = cleanId((e.currentTarget as HTMLInputElement).value))} maxlength={32} class="font-mono text-xs" aria-invalid={!!err(i, 'id')} />
            </Field>
          </div>
          {#if choice(f.type)}
            <Field label={t('Seçenekler')} hint={t('Her satıra bir seçenek.')} error={err(i, 'options')}>
              <Textarea value={optionsText(f)} oninput={(e) => setOptions(f, (e.currentTarget as HTMLTextAreaElement).value)} rows={3} aria-invalid={!!err(i, 'options')} />
            </Field>
          {:else}
            <Field label={t('Yer tutucu')}>
              <Input bind:value={f.placeholder} maxlength={150} />
            </Field>
          {/if}
          <Field label={t('Yardım metni')}>
            <Input bind:value={f.hint} maxlength={300} />
          </Field>
          <label class="flex items-center gap-2 text-sm"><Switch bind:checked={f.required} />{t('Zorunlu')}</label>
        </div>
      {/each}
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onclick={add} disabled={value.fields.length >= 30}><PlusIcon />{t('Soru ekle')}</Button>
        {#if value.fields.length}<Button variant="ghost" size="sm" onclick={() => (preview = !preview)}><EyeIcon />{preview ? t('Önizlemeyi gizle') : t('Üyenin göreceği formu önizle')}</Button>{/if}
      </div>
      {#if preview && value.fields.length}
        <div class="rounded-xl border border-dashed p-4" data-part="template-preview">
          <p class="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t('Önizleme')}</p>
          <TopicTemplateForm template={{ ...value, fields: value.fields.filter((f) => f.label.trim()) }} bind:answers={previewAnswers} />
        </div>
      {/if}
    </div>
  {/if}
</div>
