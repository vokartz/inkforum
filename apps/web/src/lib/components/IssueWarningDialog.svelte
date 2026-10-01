<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import Field from './Field.svelte';
  import NativeSelect from './NativeSelect.svelte';
  import FormMessage from './FormMessage.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import type { WarningTemplate } from '$lib/types';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    open: boolean;
    userId: number;
    userName: string;
    ondone?: () => void;
  }
  let { open = $bindable(false), userId, userName, ondone }: Props = $props();

  let templates = $state<WarningTemplate[]>([]);
  let templateId = $state('');
  let points = $state(10);
  let reason = $state('');
  let messageToUser = $state('');
  let notes = $state('');
  let expiryDays = $state<number | ''>(30);
  const form = createForm();

  $effect(() => {
    if (open && !templates.length) {
      api.get<WarningTemplate[]>('/api/mod/warning-templates').then((t) => (templates = t), () => undefined);
    }
  });

  function applyTemplate() {
    const t = templates.find((x) => String(x.id) === templateId);
    if (!t) return;
    points = t.points;
    reason = t.reasonTemplate;
    expiryDays = t.expiryDays ?? '';
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const res = await form.submit(
      () =>
        api.post(`/api/mod/users/${userId}/warnings`, {
          templateId: templateId ? Number(templateId) : null,
          points: Number(points),
          reason,
          messageToUser: messageToUser || null,
          notes: notes || null,
          expiryDays: expiryDays === '' ? null : Number(expiryDays),
        }),
      { success: t('Uyarı verildi.') },
    );
    if (res) {
      open = false;
      templateId = '';
      reason = messageToUser = notes = '';
      ondone?.();
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{t('{name} kullanıcısına uyarı ver', { name: userName })}</Dialog.Title>
      <Dialog.Description>{t('Uyarı puanları eşiklere ulaştığında otomatik kısıtlamalar uygulanır.')}</Dialog.Description>
    </Dialog.Header>
    <form class="grid gap-3" onsubmit={submit}>
      <FormMessage message={form.message} />
      {#if templates.length}
        <Field label={t('Şablon')} for="w-template">
          <NativeSelect
            id="w-template"
            bind:value={templateId}
            onchange={applyTemplate}
            options={[
              { value: '', label: t('Şablon kullanma') },
              ...templates.map((tpl) => ({ value: String(tpl.id), label: t('{title} ({points} puan)', { title: tpl.title, points: tpl.points }) })),
            ]}
          />
        </Field>
      {/if}
      <div class="grid grid-cols-2 gap-3">
        <Field label={t('Puan')} for="w-points" error={form.error('points')}>
          <Input id="w-points" type="number" min="0" bind:value={points} />
        </Field>
        <Field label={t('Geçerlilik (gün)')} for="w-exp" error={form.error('expiryDays')} hint={t('Boş = süresiz')}>
          <Input id="w-exp" type="number" min="1" bind:value={expiryDays} />
        </Field>
      </div>
      <Field label={t('Gerekçe')} for="w-reason" error={form.error('reason')} required>
        <Input id="w-reason" bind:value={reason} />
      </Field>
      <Field label={t('Üyeye mesaj')} for="w-msg" hint={t('Üyenin bildiriminde ve uyarı sayfasında görünür.')}>
        <Textarea id="w-msg" bind:value={messageToUser} rows={2} />
      </Field>
      <Field label={t('Ekip notu')} for="w-notes" hint={t('Yalnızca yetkililer görür.')}>
        <Textarea id="w-notes" bind:value={notes} rows={2} />
      </Field>
      <Dialog.Footer>
        <Button variant="ghost" onclick={() => (open = false)}>{t('Vazgeç')}</Button>
        <Button type="submit" variant="destructive" disabled={form.submitting}>{t('Uyarı ver')}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
