<script lang="ts">
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import Field from '../Field.svelte';
  import NativeSelect from '../NativeSelect.svelte';
  import Combobox, { type ComboOption } from '../Combobox.svelte';
  import type { Paginated, UserSummary } from '@forum/shared';
  import FormMessage from '../FormMessage.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { fromLocalInput, toLocalInput } from '$lib/format';
  import type { BanValue } from '$lib/types';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    banId?: number | null;
    initial?: Partial<BanValue>;
    ondone: () => void;
  }
  let { banId = null, initial = {}, ondone }: Props = $props();

  let name = $state(initial.name ?? '');
  let reasonPublic = $state(initial.reasonPublic ?? '');
  let notesPrivate = $state(initial.notesPrivate ?? '');
  let cannotAccess = $state(initial.cannotAccess ?? false);
  let cannotLogin = $state(initial.cannotLogin ?? true);
  let cannotRegister = $state(initial.cannotRegister ?? true);
  let cannotPost = $state(initial.cannotPost ?? true);
  let expires = $state(toLocalInput(initial.expiresAt ?? null));
  let triggers = $state<Array<{ type: string; value: string }>>(initial.triggers?.length ? initial.triggers.map((t) => ({ ...t })) : [{ type: 'ip', value: '' }]);
  const form = createForm();

  const types = [
    { value: 'user', label: 'Üye (ID)' },
    { value: 'ip', label: 'IP / aralık' },
    { value: 'email', label: 'E-posta' },
    { value: 'email_domain', label: 'E-posta alan adı' },
    { value: 'username', label: 'Kullanıcı adı' },
  ];
  const placeholders: Record<string, string> = {
    user: '42',
    ip: '203.0.113.7 · 10.0.0.0/8 · 192.168.*.* · 1.2.3.4-1.2.3.99',
    ip_range: '10.0.0.0/8',
    email: 'kisi@ornek.com veya *@ornek.com',
    email_domain: 'spam.com veya *.spam.com',
    username: 'kullanici veya spam*',
  };


  async function searchUsers(q: string): Promise<ComboOption[]> {
    if (q.trim().length < 2) return [];
    const res = await api.get<Paginated<{ user: UserSummary }>>(`/api/members?q=${encodeURIComponent(q)}&perPage=10&sort=name&dir=asc`);
    return res.items.map((i) => ({ value: i.user.id, label: i.user.displayName, description: `@${i.user.username} · #${i.user.id}`, avatar: i.user }));
  }
  function setPreset(days: number | null) {
    expires = days ? toLocalInput(Date.now() + days * 86_400_000) : '';
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const body = {
      name,
      reasonPublic: reasonPublic || null,
      notesPrivate: notesPrivate || null,
      cannotAccess,
      cannotLogin,
      cannotRegister,
      cannotPost,
      expiresAt: fromLocalInput(expires),
      triggers: triggers.filter((t) => t.value.trim()),
    };
    const res = await form.submit(() => (banId ? api.put(`/api/admin/bans/${banId}`, body) : api.post('/api/mod/bans', body)), {
      success: banId ? t('Yasak güncellendi.') : t('Yasak oluşturuldu.'),
    });
    if (res) ondone();
  }
</script>

<form class="grid gap-4" onsubmit={submit}>
  <FormMessage message={form.message} />
  <Field label={t('Yasak adı')} for="ban-name" error={form.error('name')} hint={t("Yalnızca yöneticiler görür (ör. 'Spam botu').")}>
    <Input id="ban-name" bind:value={name} />
  </Field>

  <div class="grid gap-2">
    <span class="text-sm font-medium">{t('Tetikleyiciler')}</span>
    {#each triggers as trigger, i (i)}
      <div class="flex gap-2">
        <NativeSelect bind:value={trigger.type} options={types.map((o) => ({ ...o, label: t(o.label) }))} class="w-44 shrink-0" />
        {#if trigger.type === 'user'}
          <div class="min-w-0 flex-1">
            <Combobox
              load={searchUsers}
              value={Number(trigger.value) || null}
              onchange={(v) => (trigger.value = typeof v === 'number' ? String(v) : '')}
              selected={trigger.value ? [{ value: Number(trigger.value), label: t('Üye #{id}', { id: trigger.value }) }] : []}
              placeholder={t('Üye ara…')}
              searchPlaceholder={t('En az 2 harf yazın…')}
            />
          </div>
        {:else}
          <Input bind:value={trigger.value} placeholder={t(placeholders[trigger.type] ?? '')} class="flex-1" />
        {/if}
        <Button variant="ghost" size="icon" onclick={() => (triggers = triggers.filter((_, j) => j !== i))} aria-label={t('Kaldır')} disabled={triggers.length === 1}
          ><TrashIcon /></Button
        >
      </div>
    {/each}
    {#if form.error('triggers')}<p class="text-xs text-destructive">{form.error('triggers')}</p>{/if}
    <div><Button variant="outline" size="sm" onclick={() => (triggers = [...triggers, { type: 'ip', value: '' }])}><PlusIcon />{t('Tetikleyici ekle')}</Button></div>
  </div>

  <div class="grid gap-2">
    <span class="text-sm font-medium">{t('Kısıtlamalar')}</span>
    <div class="grid gap-2 sm:grid-cols-2">
      <label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={cannotAccess} />{t('Foruma hiç erişemesin')}</label>
      <label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={cannotLogin} />{t('Giriş yapamasın')}</label>
      <label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={cannotRegister} />{t('Kayıt olamasın')}</label>
      <label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={cannotPost} />{t('Mesaj yazamasın')}</label>
    </div>
    {#if form.error('restrictions')}<p class="text-xs text-destructive">{form.error('restrictions')}</p>{/if}
  </div>

  <Field label={t('Bitiş')} for="ban-exp" hint={t('Boş bırakılırsa kalıcı.')}>
    <div class="flex flex-wrap items-center gap-2">
      <Input id="ban-exp" type="datetime-local" bind:value={expires} class="w-60" />
      <Button variant="ghost" size="xs" onclick={() => setPreset(1)}>{t('{n} gün', { n: 1 })}</Button>
      <Button variant="ghost" size="xs" onclick={() => setPreset(7)}>{t('{n} gün', { n: 7 })}</Button>
      <Button variant="ghost" size="xs" onclick={() => setPreset(30)}>{t('{n} gün', { n: 30 })}</Button>
      <Button variant="ghost" size="xs" onclick={() => setPreset(null)}>{t('Kalıcı')}</Button>
    </div>
  </Field>

  <Field label={t('Üyeye gösterilecek gerekçe')} for="ban-reason">
    <Input id="ban-reason" bind:value={reasonPublic} />
  </Field>
  <Field label={t('Özel not')} for="ban-notes">
    <Textarea id="ban-notes" bind:value={notesPrivate} rows={2} />
  </Field>
  <div class="flex justify-end gap-2">
    <Button type="submit" variant="destructive" disabled={form.submitting}>{banId ? t('Güncelle') : t('Yasakla')}</Button>
  </div>
</form>
