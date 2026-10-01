<script lang="ts">
  import BellIcon from 'phosphor-svelte/lib/Bell';
  import EnvelopeIcon from 'phosphor-svelte/lib/EnvelopeSimple';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { api } from '$lib/api';
  import { createForm } from '$lib/form.svelte';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  type Pref = { type: string; label: string; enabled: boolean | null; email: boolean | null };
  let prefs = $state<Pref[]>((data.prefs as Pref[]).map((p) => ({ ...p })));
  const form = createForm();

  async function save() {
    const body: Record<string, boolean> = {};
    for (const p of prefs) {
      if (p.enabled !== null) body[p.type] = p.enabled;
      if (p.email !== null) body[`email:${p.type}`] = p.email;
    }
    await form.submit(() => api.put('/api/me/notifications/preferences', body), { success: t('Bildirim tercihlerin kaydedildi.'), toastErrors: true });
  }
</script>

<PageHeader title={t('Bildirim tercihleri')} description={t('Hangi durumlarda site içinde ya da e-postayla haber almak istediğini seç.')} />

<div class="max-w-2xl overflow-hidden rounded-xl border bg-card">
  <div class="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b bg-panel-header px-5 py-2.5 text-xs font-bold text-muted-foreground">
    <span>{t('Durum')}</span>
    <span class="flex items-center justify-center gap-1"><BellIcon class="size-3.5" />{t('Site')}</span>
    <span class="flex items-center justify-center gap-1"><EnvelopeIcon class="size-3.5" />{t('E-posta')}</span>
  </div>
  {#each prefs as p (p.type)}
    <div class="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b px-5 py-3 last:border-b-0">
      <span class="text-sm">{tc(p.label)}</span>
      <span class="flex justify-center">{#if p.enabled !== null}<Switch bind:checked={p.enabled as boolean} aria-label={t('{label} — site içi', { label: tc(p.label) })} />{:else}<span class="text-muted-foreground">—</span>{/if}</span>
      <span class="flex justify-center">{#if p.email !== null}<Switch bind:checked={p.email as boolean} aria-label={t('{label} — e-posta', { label: tc(p.label) })} />{:else}<span class="text-muted-foreground">—</span>{/if}</span>
    </div>
  {/each}
</div>
<p class="mt-3 max-w-2xl text-xs text-muted-foreground">{t('Takip ettiğin konular için konuyu tekrar ziyaret edene kadar yalnızca bir e-posta gönderilir; özel mesajlarda da okunmamış mesajın varken yeni e-posta gelmez.')}</p>
<div class="mt-4"><Button onclick={save} disabled={form.submitting}>{t('Kaydet')}</Button></div>
