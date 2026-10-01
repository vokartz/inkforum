<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import { Label } from '$lib/components/ui/label';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';
  import type { Privacy } from '$lib/settings-types';

  let { data } = $props();
  // Eski kayıtlarda alan olmayabilir
  let privacy = $state<Privacy>({ ...data.profile.privacy, allowMessages: data.profile.privacy.allowMessages ?? 'everyone' });
  const form = createForm();

  async function save() {
    await form.submit(() => api.put('/api/me/privacy', privacy), { success: t('Gizlilik ayarlarınız kaydedildi.'), toastErrors: true });
  }
</script>

<PageHeader title={t('Gizlilik')} description={t('Profil bilgilerinizi kimlerin görebileceğini belirleyin.')} />

<Card.Root class="max-w-2xl">
  <Card.Content class="grid gap-6">
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label for="p-online">{t('Çevrimiçi durumumu göster')}</Label>
        <p class="text-xs text-muted-foreground">{t('Kapalıyken çevrimiçi listesinde ve profilinizde son etkinliğiniz görünmez.')}</p>
      </div>
      <Switch id="p-online" bind:checked={privacy.showOnline} />
    </div>
    <div class="flex items-center justify-between gap-4">
      <div>
        <Label for="p-ach">{t('Başarılarımı göster')}</Label>
        <p class="text-xs text-muted-foreground">{t('Profilinizde kazandığınız başarılar listelenir.')}</p>
      </div>
      <Switch id="p-ach" bind:checked={privacy.showAchievements} />
    </div>
    <div class="grid gap-1.5">
      <Label for="p-msg">{t('Bana kimler özel mesaj gönderebilir?')}</Label>
      <NativeSelect
        id="p-msg"
        bind:value={privacy.allowMessages}
        class="sm:w-72"
        options={[
          { value: 'everyone', label: t('Tüm üyeler') },
          { value: 'nobody', label: t('Kimse (yalnızca yöneticiler)') },
        ]}
      />
    </div>
    <div class="grid gap-1.5">
      <Label for="p-profile">{t('Profilimi kimler görebilir?')}</Label>
      <NativeSelect
        id="p-profile"
        bind:value={privacy.profileVisibility}
        class="sm:w-72"
        options={[
          { value: 'everyone', label: t('Herkes (misafirler dahil)') },
          { value: 'members', label: t('Yalnızca üyeler') },
        ]}
      />
    </div>
    <div class="grid gap-1.5">
      <Label for="p-birth">{t('Doğum tarihim')}</Label>
      <NativeSelect
        id="p-birth"
        bind:value={privacy.birthdateVisibility}
        class="sm:w-72"
        options={[
          { value: 'none', label: t('Gizli') },
          { value: 'day_month', label: t('Yalnızca gün ve ay') },
          { value: 'full', label: t('Tam tarih ve yaş') },
        ]}
      />
    </div>
    <div><Button onclick={save} disabled={form.submitting}>{t('Kaydet')}</Button></div>
  </Card.Content>
</Card.Root>
