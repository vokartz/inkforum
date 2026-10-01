<script lang="ts">
  import { APPLICATION_FIELD_LABELS, APPLICATION_FIELD_TYPES, type ApplicationFormInput, type ApplicationQuestion } from '@forum/shared';
  import { untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { goto, invalidate } from '$app/navigation';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { toast } from 'svelte-sonner';
  import PageHeaderIcon from 'phosphor-svelte/lib/ClipboardText';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import CopyIcon from 'phosphor-svelte/lib/CopySimple';
  import DotsSixIcon from 'phosphor-svelte/lib/DotsSixVertical';
  import FloppyIcon from 'phosphor-svelte/lib/FloppyDisk';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import ArrowSquareOutIcon from 'phosphor-svelte/lib/ArrowSquareOut';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import IconPicker from '$lib/components/IconPicker.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import { api, ApiError, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();

  type Q = ApplicationQuestion & { uid: string };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const blank = (): ApplicationFormInput => ({
    slug: '',
    title: '',
    description: '',
    icon: 'clipboard-text',
    isOpen: true,
    questions: [
      { id: 'hakkinda', type: 'textarea', label: t('Kendinden biraz bahset.'), help: '', required: true, options: [], minLength: 30, maxLength: 3000 },
      { id: 'neden', type: 'textarea', label: t('Neden bu ekibe katılmak istiyorsun?'), help: '', required: true, options: [], minLength: 30, maxLength: 3000 },
      { id: 'kurallar', type: 'yesno', label: t('Kuralları okudun ve kabul ediyor musun?'), help: '', required: true, options: [], minLength: 0, maxLength: 2000 },
    ],
    requirements: { minAccountDays: 7, minPosts: 0, emailVerified: true, requiredGroupIds: [], blockedGroupIds: [], maxWarningPoints: null, cooldownDays: 7 },
    targetGroupId: null,
    setPrimary: false,
    reviewerGroupIds: [],
    acceptMessage: t('Tebrikler, başvurun onaylandı!'),
    rejectMessage: t('Başvurun şu an için uygun görülmedi. Bir süre sonra yeniden başvurabilirsin.'),
    sortOrder: 0,
  });
  let form = $state<ApplicationFormInput>(untrack(() => (data.form ? structuredClone($state.snapshot(data.form)) : blank())));
  let questions = $state<Q[]>(untrack(() => form.questions.map((q) => ({ ...q, uid: uid() }))));
  let slugTouched = $state(untrack(() => !!data.form));
  let errors = $state<Record<string, string>>({});
  let saving = $state(false);

  const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  const slugify = (s: string, sep = '-') =>
    s
      .toLocaleLowerCase('tr-TR')
      .replace(/[çğıöşüâîû]/g, (c) => TR[c] ?? c)
      .replace(/[^a-z0-9]+/g, sep)
      .replace(new RegExp(`^${sep}+|${sep}+$`, 'g'), '')
      .slice(0, 40);

  function addQuestion(type: ApplicationQuestion['type'] = 'text') {
    let id = `soru-${questions.length + 1}`;
    while (questions.some((q) => q.id === id)) id = `${id}-x`;
    questions = [...questions, { uid: uid(), id, type, label: '', help: '', required: true, options: ['text', 'textarea', 'number', 'url', 'yesno'].includes(type) ? [] : [t('Seçenek 1'), t('Seçenek 2')], minLength: 0, maxLength: type === 'textarea' ? 3000 : 200 }];
  }
  function duplicate(i: number) {
    const q = questions[i]!;
    questions = [...questions.slice(0, i + 1), { ...$state.snapshot(q), uid: uid(), id: `${q.id}-2`.slice(0, 40), options: [...q.options] }, ...questions.slice(i + 1)];
  }
  const onDnd = (e: CustomEvent<DndEvent<Q>>) => (questions = e.detail.items);
  const toggleIn = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const assignable = $derived(data.groups.filter((g) => g.kind === 'regular' && !['admin', 'guest', 'member'].includes(g.systemKey ?? '')));

  async function save() {
    saving = true;
    errors = {};
    try {
      const body = { ...form, questions: questions.map(({ uid: _u, ...q }) => ({ ...q, id: q.id || slugify(q.label, '_') || `s${Math.random().toString(36).slice(2, 6)}` })) };
      const saved = data.form ? await api.put<{ id: number }>(`/api/admin/application-forms/${data.form.id}`, body) : await api.post<{ id: number }>('/api/admin/application-forms', body);
      toast.success(t('Form kaydedildi.'));
      if (!data.form) await goto(`/admin/applications/${saved.id}`, { replaceState: true });
      else await invalidate('app:admin-applications');
    } catch (e) {
      if (e instanceof ApiError) {
        errors = e.fields;
        toast.error(Object.values(e.fields)[0] ?? e.message);
      } else toast.error(errorMessage(e));
    } finally {
      saving = false;
    }
  }
  async function remove() {
    if (!data.form || !(await confirmAction({ title: t('Form silinsin mi?'), description: t('Forma ait tüm başvurular ve notlar da silinir.'), confirmLabel: t('Sil'), destructive: true }))) return;
    try {
      await api.delete(`/api/admin/application-forms/${data.form.id}`);
      toast.success(t('Form silindi.'));
      await goto('/admin/applications');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  const qErr = (i: number) => Object.entries(errors).find(([k]) => k.startsWith(`questions.${i}.`))?.[1];
</script>

<svelte:head><title>{data.isNew ? t('Yeni başvuru formu') : form.title} · {t('Yönetim')}</title></svelte:head>

<PageHeader icon={PageHeaderIcon} title={data.isNew ? t('Yeni başvuru formu') : t('Başvuru formunu düzenle')} description={form.slug ? `/applications/${form.slug}` : t('Başlık, sorular ve gereksinimler.')}>
  {#snippet actions()}
    <Button variant="ghost" href="/admin/applications"><ArrowLeftIcon />{t('Formlar')}</Button>
    {#if data.form}<Button variant="outline" href="/applications/{data.form.slug}" target="_blank"><ArrowSquareOutIcon />{t('Görüntüle')}</Button>{/if}
    <Button onclick={save} disabled={saving || !form.title.trim()}>{#if saving}<LoaderIcon class="animate-spin" />{:else}<FloppyIcon />{/if}{t('Kaydet')}</Button>
  {/snippet}
</PageHeader>

<div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
  <div class="grid min-w-0 content-start gap-5">
    <Card.Root>
      <Card.Content class="grid gap-4">
        <div class="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
          <Field label={t('İkon')}><IconPicker bind:name={form.icon} withColor={false} /></Field>
          <Field label={t('Başlık')} error={errors.title}><Input bind:value={form.title} oninput={() => !slugTouched && (form.slug = slugify(form.title))} maxlength={120} class="h-11 font-semibold" placeholder={t('ör. Yetkili başvurusu')} /></Field>
        </div>
        <Field label={t('Açıklama')} hint={t('Başvuranın formun üstünde göreceği bilgi (kurallar, süreç).')}>
          <Editor bind:value={form.description} minHeight={160} maxLength={20000} mentions={false} uploadUrl="/api/admin/pages/images" />
        </Field>
      </Card.Content>
    </Card.Root>

    <!-- Sorular -->
    <section class="grid gap-3">
      <div class="flex items-center justify-between">
        <h2 class="font-bold">{t('Sorular')} <span class="text-muted-foreground">({questions.length})</span></h2>
        <p class="text-xs text-muted-foreground">{t('Sıralamak için sürükleyin.')}</p>
      </div>
      <div class="grid gap-3" use:dndzone={{ items: questions, flipDurationMs: 150, type: 'app-questions', dragDisabled: false, dropTargetStyle: { outline: '2px dashed var(--primary)', borderRadius: '12px' } }} onconsider={onDnd} onfinalize={onDnd}>
        {#each questions as q, i (q.uid)}
          <div animate:flip={{ duration: 150 }} class={cn('grid gap-3 rounded-xl border bg-card p-4', qErr(i) && 'border-destructive/60')}>
            <div class="flex items-center gap-2">
              <DotsSixIcon class="size-5 shrink-0 cursor-grab text-muted-foreground" />
              <span class="flex size-6 items-center justify-center rounded-md bg-primary-soft text-xs font-bold text-highlight">{i + 1}</span>
              <select bind:value={q.type} class="h-8 rounded-md border bg-background px-2 text-sm">
                {#each APPLICATION_FIELD_TYPES as ft (ft)}<option value={ft}>{t(APPLICATION_FIELD_LABELS[ft])}</option>{/each}
              </select>
              <label class="ml-auto flex items-center gap-2 text-xs font-semibold">{t('Zorunlu')} <Switch bind:checked={q.required} /></label>
              <Button variant="ghost" size="icon-sm" onclick={() => duplicate(i)} title={t('Çoğalt')}><CopyIcon /></Button>
              <Button variant="ghost" size="icon-sm" class="text-destructive" onclick={() => (questions = questions.filter((_, k) => k !== i))} disabled={questions.length <= 1} title={t('Sil')}><TrashIcon /></Button>
            </div>
            <Input bind:value={q.label} placeholder={t('Soru')} maxlength={300} class="font-semibold" />
            <Input bind:value={q.help} placeholder={t('Açıklama / ipucu (isteğe bağlı)')} maxlength={600} class="text-sm" />
            {#if q.type === 'select' || q.type === 'radio' || q.type === 'checkboxes'}
              <Textarea value={q.options.join('\n')} oninput={(e) => (q.options = (e.currentTarget as HTMLTextAreaElement).value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30))} rows={3} placeholder={t('Her satıra bir seçenek')} class="text-sm" />
            {:else if q.type === 'text' || q.type === 'textarea'}
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                {t('En az')} <Input type="number" bind:value={q.minLength} min={0} max={10000} class="h-8 w-24" /> {t('en fazla')} <Input type="number" bind:value={q.maxLength} min={1} max={20000} class="h-8 w-24" /> {t('karakter')}
              </div>
            {/if}
            <details class="text-xs text-muted-foreground"><summary class="cursor-pointer">{t('Gelişmiş')}</summary><div class="mt-2 flex items-center gap-2">{t('Soru kimliği')} <Input bind:value={q.id} class="h-8 w-44 font-mono text-xs" maxlength={40} /></div></details>
            {#if qErr(i)}<p class="text-sm text-destructive">{qErr(i)}</p>{/if}
          </div>
        {/each}
      </div>
      <div class="flex flex-wrap gap-1.5">
        {#each APPLICATION_FIELD_TYPES as ft (ft)}
          <button type="button" class="inline-flex h-8 items-center gap-1 rounded-md border border-dashed px-2.5 text-xs font-semibold hover:border-primary hover:bg-accent" onclick={() => addQuestion(ft)}><PlusIcon class="size-3.5" />{t(APPLICATION_FIELD_LABELS[ft])}</button>
        {/each}
      </div>
    </section>
  </div>

  <aside class="grid content-start gap-4">
    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Yayın')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-4">
        <label class="flex items-center justify-between text-sm font-semibold">{t('Başvuruya açık')} <Switch bind:checked={form.isOpen} /></label>
        <Field label={t('Adres')} error={errors.slug}>
          <div class="flex items-center overflow-hidden rounded-md border bg-background focus-within:border-ring">
            <span class="border-r bg-muted px-2 py-2 font-mono text-xs text-muted-foreground">/applications/</span>
            <input bind:value={form.slug} oninput={() => (slugTouched = true)} maxlength={60} class="min-w-0 flex-1 bg-transparent px-2 py-2 font-mono text-sm outline-none" />
          </div>
        </Field>
        <Field label={t('Sıra')}><Input type="number" bind:value={form.sortOrder} min={0} class="w-28" /></Field>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Gereksinimler')}</Card.Title><Card.Description>{t('Karşılamayan üyeler başvuramaz.')}</Card.Description></Card.Header>
      <Card.Content class="grid gap-3">
        <label class="flex items-center justify-between text-sm">{t('E-posta doğrulanmış olmalı')} <Switch bind:checked={form.requirements.emailVerified} /></label>
        <div class="grid grid-cols-2 gap-3">
          <Field label={t('En az üyelik (gün)')}><Input type="number" bind:value={form.requirements.minAccountDays} min={0} /></Field>
          <Field label={t('En az mesaj')}><Input type="number" bind:value={form.requirements.minPosts} min={0} /></Field>
          <Field label={t('En fazla uyarı puanı')} hint={t('Boş = şart yok')}><Input type="number" value={form.requirements.maxWarningPoints ?? ''} oninput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; form.requirements.maxWarningPoints = v === '' ? null : Number(v); }} min={0} /></Field>
          <Field label={t('Ret sonrası bekleme (gün)')}><Input type="number" bind:value={form.requirements.cooldownDays} min={0} /></Field>
        </div>
        <Field label={t('Şu gruplardan birinde olmalı')} hint={t('Boşsa herkes başvurabilir.')}>
          <div class="flex flex-wrap gap-1.5">
            {#each data.groups as g (g.id)}
              <button type="button" onclick={() => (form.requirements.requiredGroupIds = toggleIn(form.requirements.requiredGroupIds, g.id))} class={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', form.requirements.requiredGroupIds.includes(g.id) ? 'border-primary bg-primary-soft text-highlight' : 'hover:bg-accent')}>{tc(g.name)}</button>
            {/each}
          </div>
        </Field>
        <Field label={t('Bu gruplar başvuramaz')}>
          <div class="flex flex-wrap gap-1.5">
            {#each data.groups as g (g.id)}
              <button type="button" onclick={() => (form.requirements.blockedGroupIds = toggleIn(form.requirements.blockedGroupIds, g.id))} class={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', form.requirements.blockedGroupIds.includes(g.id) ? 'border-destructive bg-destructive/10 text-destructive' : 'hover:bg-accent')}>{tc(g.name)}</button>
            {/each}
          </div>
        </Field>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header><Card.Title class="text-base">{t('Onay ve inceleme')}</Card.Title></Card.Header>
      <Card.Content class="grid gap-3">
        <Field label={t('Onaylanınca eklenecek grup')} error={errors.targetGroupId}>
          <select bind:value={form.targetGroupId} class="h-9 rounded-md border bg-background px-2 text-sm">
            <option value={null}>{t('— Grup ekleme —')}</option>
            {#each assignable as g (g.id)}<option value={g.id}>{tc(g.name)}</option>{/each}
          </select>
        </Field>
        {#if form.targetGroupId}<label class="flex items-center justify-between text-sm">{t('Ana grup yap')} <Switch bind:checked={form.setPrimary} /></label>{/if}
        <Field label={t('İnceleyici gruplar')} hint={t('Yöneticiler her zaman inceleyebilir; yeni başvurular bu gruplara bildirilir.')}>
          <div class="flex flex-wrap gap-1.5">
            {#each data.groups.filter((g) => g.systemKey !== 'guest' && g.systemKey !== 'member') as g (g.id)}
              <button type="button" onclick={() => (form.reviewerGroupIds = toggleIn(form.reviewerGroupIds, g.id))} class={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', form.reviewerGroupIds.includes(g.id) ? 'border-primary bg-primary-soft text-highlight' : 'hover:bg-accent')}>{tc(g.name)}</button>
            {/each}
          </div>
        </Field>
        <Field label={t('Onay mesajı')}><Textarea bind:value={form.acceptMessage} rows={2} maxlength={2000} /></Field>
        <Field label={t('Ret mesajı')}><Textarea bind:value={form.rejectMessage} rows={2} maxlength={2000} /></Field>
      </Card.Content>
    </Card.Root>
    {#if data.form}<Button variant="ghost" class="text-destructive" onclick={remove}><TrashIcon />{t('Formu sil')}</Button>{/if}
  </aside>
</div>
