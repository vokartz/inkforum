<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Field from '$lib/components/Field.svelte';
  import NativeSelect from '$lib/components/NativeSelect.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t } from '$lib/i18n.svelte';
  import { theme as themeState, type ThemePreference } from '$lib/theme.svelte';

  let { data } = $props();
  let timezone = $state(data.viewer.user?.timezone ?? 'Europe/Istanbul');
  let theme = $state<ThemePreference>(data.viewer.user?.theme ?? 'system');
  const form = createForm();

  const zones = (() => {
    try {
      return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
    } catch {
      return ['Europe/Istanbul', 'UTC', 'Europe/Berlin', 'Europe/London', 'America/New_York'];
    }
  })();

  async function save() {
    const res = await form.submit(() => api.put('/api/me/preferences', { timezone, theme }), { success: t('Tercihleriniz kaydedildi.'), toastErrors: true });
    if (res) {
      themeState.set(theme);
      await invalidateAll();
    }
  }
</script>

<PageHeader title={t('Tercihler')} description={t('Görünüm ve saat dilimi.')} />

<Card.Root class="max-w-2xl">
  <Card.Content class="grid gap-5 pt-6">
    <Field label={t('Tema')} for="theme">
      <NativeSelect
        id="theme"
        bind:value={theme}
        class="sm:w-72"
        options={[
          { value: 'system', label: t('Forum varsayılanı') },
          { value: 'light', label: t('Açık') },
          { value: 'dark', label: t('Koyu') },
        ]}
      />
    </Field>
    <Field label={t('Saat dilimi')} for="tz" error={form.error('timezone')}>
      <NativeSelect id="tz" bind:value={timezone} class="sm:w-72" options={zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))} />
    </Field>
    <div><Button onclick={save} disabled={form.submitting}>{t('Kaydet')}</Button></div>
  </Card.Content>
</Card.Root>
