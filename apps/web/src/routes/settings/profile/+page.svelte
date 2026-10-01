<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import FormMessage from '$lib/components/FormMessage.svelte';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import Editor from '$lib/components/editor/Editor.svelte';
  import CustomFieldInput from '$lib/components/CustomFieldInput.svelte';
  import { api, errorMessage } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';
  import { profileUrl } from '$lib/viewer';

  let { data } = $props();
  const p = data.profile;

  let avatarUrl = $state(p.avatarUrl);
  let bio = $state(p.bio);
  let location = $state(p.location);
  let websiteUrl = $state(p.websiteUrl);
  let birthdate = $state(p.birthdate);
  let customTitle = $state(p.customTitle);
  let signature = $state(p.signature);
  let customFields = $state<Record<string, string>>(Object.fromEntries(p.customFields.map((f) => [f.key, f.value])));

  const form = createForm();
  const sigForm = createForm();

  async function uploadAvatar(blob: Blob, filename: string) {
    try {
      const res = await api.upload<{ avatarUrl: string }>('/api/me/avatar', blob, filename);
      avatarUrl = res.avatarUrl;
      toast.success(t('Profil fotoğrafınız güncellendi.'));
      await invalidateAll();
    } catch (e) {
      throw new Error(errorMessage(e), { cause: e });
    }
  }

  async function removeAvatar() {
    await api.delete('/api/me/avatar');
    avatarUrl = null;
    toast.success(t('Profil fotoğrafı kaldırıldı.'));
    await invalidateAll();
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    const res = await form.submit(
      () =>
        api.put('/api/me/profile', {
          bio,
          location,
          websiteUrl,
          birthdate,
          ...(p.can.customTitle ? { customTitle } : {}),
          customFields,
        }),
      { success: t('Profiliniz kaydedildi.') },
    );
    if (res) await invalidateAll();
  }

  async function saveSignature(e: SubmitEvent) {
    e.preventDefault();
    await sigForm.submit(() => api.put('/api/me/signature', { signature }), { success: t('İmzanız kaydedildi.') });
  }
</script>

<PageHeader title={t('Profil')} description={t('Diğer üyelerin sizi nasıl göreceğini düzenleyin.')}>
  {#snippet actions()}
    {#if data.viewer.user}<Button href={profileUrl(data.viewer.user)} variant="outline" size="sm">{t('Profilimi görüntüle')}</Button>{/if}
  {/snippet}
</PageHeader>

<div class="grid gap-6">
  {#if p.can.avatar}
    <Card.Root>
      <Card.Header>
        <Card.Title class="text-base">{t('Profil fotoğrafı')}</Card.Title>
        <Card.Description>{t('Kare olarak kırpılır ve {size}×{size} piksele küçültülür.', { size: p.limits.avatarSize })}</Card.Description>
      </Card.Header>
      <Card.Content>
        <ImageUpload
          current={avatarUrl}
          squareSize={p.limits.avatarSize}
          maxBytes={p.limits.avatarMaxKb * 1024}
          rounded
          onupload={uploadAvatar}
          onremove={removeAvatar}
          label={t('Fotoğraf yükle')}
        />
      </Card.Content>
    </Card.Root>
  {/if}

  <Card.Root>
    <Card.Header><Card.Title class="text-base">{t('Hakkımda')}</Card.Title></Card.Header>
    <Card.Content>
      <form class="grid gap-4" onsubmit={save}>
        <FormMessage message={form.message} />
        {#if p.can.customTitle}
          <Field label={t('Özel başlık')} for="customTitle" error={form.error('customTitle')} hint={t('İsminizin altında görünür.')}>
            <Input id="customTitle" bind:value={customTitle} maxlength={p.limits.customTitleMaxLength} />
          </Field>
        {/if}
        <Field label={t('Kendinizden bahsedin')} for="bio" error={form.error('bio')}>
          <Editor id="bio" bind:value={bio} maxLength={p.limits.bioMaxLength} compact minHeight={140} mentions={false} previewKind="short" placeholder={t('Kendinizden bahsedin…')} />
        </Field>
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label={t('Konum')} for="location" error={form.error('location')}>
            <Input id="location" bind:value={location} maxlength={80} placeholder={t('Örn. İstanbul')} />
          </Field>
          <Field label={t('Web sitesi')} for="website" error={form.error('websiteUrl')}>
            <Input id="website" type="url" bind:value={websiteUrl} placeholder="https://" />
          </Field>
        </div>
        <Field label={t('Doğum tarihi')} for="birthdate" error={form.error('birthdate')} hint={t('Kimlerin görebileceğini Gizlilik bölümünden seçebilirsiniz.')}>
          <Input id="birthdate" type="date" bind:value={birthdate} class="sm:w-56" max={new Date().toISOString().slice(0, 10)} />
        </Field>
        {#each p.customFields as field (field.key)}
          <CustomFieldInput {field} bind:value={customFields[field.key]} error={form.error(`customFields.${field.key}`)} />
        {/each}
        <div><Button type="submit" disabled={form.submitting}>{form.submitting ? t('Kaydediliyor…') : t('Kaydet')}</Button></div>
      </form>
    </Card.Content>
  </Card.Root>

  {#if p.can.signature}
    <Card.Root>
      <Card.Header>
        <Card.Title class="text-base">{t('İmza')}</Card.Title>
        <Card.Description>{t('En fazla {chars} karakter ve {lines} satır.', { chars: p.limits.signatureMaxLength, lines: p.limits.signatureMaxLines })}</Card.Description>
      </Card.Header>
      <Card.Content>
        <form class="grid gap-3" onsubmit={saveSignature}>
          <Editor bind:value={signature} maxLength={p.limits.signatureMaxLength} compact minHeight={90} mentions={false} previewKind="short" placeholder={t('Mesajlarınızın altında görünecek imza…')} invalid={!!sigForm.error('signature')} />
          {#if sigForm.error('signature')}<p class="text-xs text-destructive">{sigForm.error('signature')}</p>{/if}
          <div><Button type="submit" variant="outline" disabled={sigForm.submitting}>{t('İmzayı kaydet')}</Button></div>
        </form>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
