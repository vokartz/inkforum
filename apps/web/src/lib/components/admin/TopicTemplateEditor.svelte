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
  import { t } from '$lib/i18n.svelte';

  /**
   * Konu şablonu düzenleyicisi: bu bölümde konu açan üyelere sorulacak sorular.
   * Yanıtlar mesaja "soru — yanıt" olarak yazılır; başlık şablonu {q1} ile doldurulur.
   */
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
            <Input bind:value={f.label} placeholder={t('Soru (ör. Oyundaki adın nedir?)')} maxlength={150} class="flex-1" aria-invalid={!!errors[`topicTemplate.fields.${i}.label`]} />
            <Button variant="ghost" size="icon-sm" disabled={i === 0} onclick={() => move(i, -1)} title={t('Yukarı taşı')}><ArrowUpIcon /></Button>
            <Button variant="ghost" size="icon-sm" disabled={i === value.fields.length - 1} onclick={() => move(i, 1)} title={t('Aşağı taşı')}><ArrowDownIcon /></Button>
            <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => remove(i)} title={t('Kaldır')}><TrashIcon /></Button>
          </div>
          <div class="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <Field label={t('Yanıt türü')}>
              <NativeSelect bind:value={f.type} options={TYPES} />
            </Field>
            <Field label={t('Alan kimliği')} error={errors[`topicTemplate.fields.${i}.id`] ?? null}>
              <Input bind:value={f.id} maxlength={32} class="font-mono text-xs" />
            </Field>
          </div>
          {#if choice(f.type)}
            <Field label={t('Seçenekler')} hint={t('Her satıra bir seçenek.')} error={errors[`topicTemplate.fields.${i}.options`] ?? null}>
              <Textarea value={optionsText(f)} oninput={(e) => setOptions(f, (e.currentTarget as HTMLTextAreaElement).value)} rows={3} />
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
      <Button variant="outline" size="sm" class="justify-self-start" onclick={add} disabled={value.fields.length >= 30}><PlusIcon />{t('Soru ekle')}</Button>
    </div>
  {/if}
</div>
