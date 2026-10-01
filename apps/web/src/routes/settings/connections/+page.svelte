<script lang="ts">
  import { API_SCOPE_INFO, SOCIAL_PROVIDERS, type AuthorizedApp, type SocialProvider } from '@forum/shared';
  import { page } from '$app/state';
  import { invalidate } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import LinkIcon from 'phosphor-svelte/lib/LinkSimple';
  import LinkBreakIcon from 'phosphor-svelte/lib/LinkBreak';
  import AppWindowIcon from 'phosphor-svelte/lib/AppWindow';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
  import WarningIcon from 'phosphor-svelte/lib/WarningCircle';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import BrandIcon from '$lib/components/BrandIcon.svelte';
  import TimeAgo from '$lib/components/TimeAgo.svelte';
  import { api, errorMessage } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { formatDate } from '$lib/format';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  const linked = $derived(new Map(data.identities.map((i) => [i.provider, i])));
  // Etkin sağlayıcılar + (sonradan kapatılmış olsa da) bağlı olanlar
  const rows = $derived(SOCIAL_PROVIDERS.filter((p) => data.providers.some((x) => x.key === p.key) || linked.has(p.key)));
  const linkedMsg = $derived(page.url.searchParams.get('linked'));
  const errorMsg = $derived.by(() => {
    const e = page.url.searchParams.get('social_error');
    if (!e) return null;
    return e === 'taken' ? t('Bu hesap başka bir üyeye bağlı.') : e === 'denied' ? t('Bağlama iptal edildi.') : t('Hesap bağlanamadı.');
  });

  async function unlink(p: SocialProvider, label: string) {
    if (!(await confirmAction({ title: t('{label} bağlantısı kaldırılsın mı?', { label }), description: t('Artık {label} ile giriş yapamazsın.', { label }), confirmLabel: t('Kaldır'), destructive: true }))) return;
    try {
      await api.delete(`/api/me/identities/${p}`);
      toast.success(t('Bağlantı kaldırıldı.'));
      await invalidate('app:connections');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function revoke(app: AuthorizedApp) {
    if (!(await confirmAction({ title: t('{name} erişimi kaldırılsın mı?', { name: app.name }), description: t('Uygulama hesabına artık erişemez; tekrar kullanmak için yeniden izin vermen gerekir.'), confirmLabel: t('Erişimi kaldır'), destructive: true })))
      return;
    try {
      await api.delete(`/api/me/apps/${app.clientId}`);
      toast.success(t('Uygulamanın erişimi kaldırıldı.'));
      await invalidate('app:connections');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
</script>

<PageHeader title={t('Bağlantılar')} description={t('Giriş için bağladığın hesaplar ve forum hesabına erişim izni verdiğin uygulamalar.')} />

<div class="grid max-w-2xl gap-6">
  {#if linkedMsg}
    <p class="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2.5 text-sm"><CheckCircleIcon class="size-4 text-success" weight="fill" />{t('Hesap bağlandı; artık onunla da giriş yapabilirsin.')}</p>
  {/if}
  {#if errorMsg}
    <p class="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"><WarningIcon class="size-4" />{errorMsg}</p>
  {/if}

  <section class="overflow-hidden rounded-xl border bg-card">
    <header class="border-b px-5 py-3.5">
      <h2 class="font-bold">{t('Sosyal hesaplar')}</h2>
      <p class="text-sm text-muted-foreground">{t('Bağladığın hesapla şifre girmeden giriş yapabilirsin.')}</p>
    </header>
    {#each rows as p (p.key)}
      {@const id = linked.get(p.key)}
      <div class="flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0">
        <BrandIcon platform={p.key} badge size={15} />
        <div class="min-w-0 flex-1">
          <p class="font-semibold">{p.label}</p>
          <p class="truncate text-xs text-muted-foreground">
            {#if id}{id.displayName ?? ''}{id.email ? ` · ${id.email}` : ''} · {t('{date} tarihinde bağlandı', { date: formatDate(id.createdAt) })}{:else}{t('Bağlı değil')}{/if}
          </p>
        </div>
        {#if id}
          <Button variant="ghost" size="sm" class="text-destructive" onclick={() => unlink(p.key, p.label)}><LinkBreakIcon />{t('Kaldır')}</Button>
        {:else}
          <Button variant="outline" size="sm" href="/api/auth/social/{p.key}/start?mode=link&next=/settings/connections" data-sveltekit-reload><LinkIcon />{t('Bağla')}</Button>
        {/if}
      </div>
    {:else}
      <p class="px-5 py-6 text-center text-sm text-muted-foreground">{t('Bu forumda sosyal giriş etkin değil.')}</p>
    {/each}
  </section>

  <section class="overflow-hidden rounded-xl border bg-card">
    <header class="border-b px-5 py-3.5">
      <h2 class="font-bold">{t('Yetki verdiğin uygulamalar')}</h2>
      <p class="text-sm text-muted-foreground">{t('"Forum hesabıyla giriş" kullandığın siteler ve paneller (ör. UCP).')}</p>
    </header>
    {#each data.apps as app (app.clientId)}
      <div class="flex items-start gap-3 border-b px-5 py-3.5 last:border-b-0">
        {#if app.logoUrl}<img src={app.logoUrl} alt="" class="size-10 rounded-lg object-cover" />{:else}<span class="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground"><AppWindowIcon class="size-5" /></span>{/if}
        <div class="min-w-0 flex-1">
          <p class="font-semibold">{#if app.homepageUrl}<a href={app.homepageUrl} target="_blank" rel="noopener noreferrer" class="hover:underline">{app.name}</a>{:else}{app.name}{/if}</p>
          <p class="text-xs text-muted-foreground">{app.scopes.map((s) => (API_SCOPE_INFO[s] ? t(API_SCOPE_INFO[s].label) : s)).join(' · ')}</p>
          <p class="text-xs text-muted-foreground">{t('İzin: {date}', { date: formatDate(app.approvedAt) })}{#if app.lastUsedAt} · {t('Son kullanım:')} <TimeAgo ms={app.lastUsedAt} />{/if}</p>
        </div>
        <Button variant="ghost" size="sm" class="text-destructive" onclick={() => revoke(app)}>{t('Erişimi kaldır')}</Button>
      </div>
    {:else}
      <p class="px-5 py-6 text-center text-sm text-muted-foreground">{t('Henüz hiçbir uygulamaya izin vermedin.')}</p>
    {/each}
  </section>
</div>
