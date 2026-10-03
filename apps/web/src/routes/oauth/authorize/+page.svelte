<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import AppWindowIcon from 'phosphor-svelte/lib/AppWindow';
  import UserIcon from 'phosphor-svelte/lib/IdentificationCard';
  import EnvelopeIcon from 'phosphor-svelte/lib/EnvelopeSimple';
  import BookIcon from 'phosphor-svelte/lib/BookOpen';
  import PencilIcon from 'phosphor-svelte/lib/PencilSimpleLine';
  import ChatsIcon from 'phosphor-svelte/lib/ChatsCircle';
  import ShieldIcon from 'phosphor-svelte/lib/ShieldCheck';
  import ArrowsIcon from 'phosphor-svelte/lib/ArrowsLeftRight';
  import WarningIcon from 'phosphor-svelte/lib/WarningCircle';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import { Button } from '$lib/components/ui/button';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import BrandMark from '$lib/components/layout/BrandMark.svelte';
  import { api, errorMessage } from '$lib/api';
  import { t } from '$lib/i18n.svelte';
  import type { IconComponent } from '$lib/utils';

  let { data } = $props();
  const info = $derived(data.info);
  const user = $derived(data.viewer.user!);
  const ICONS: Record<string, IconComponent> = { profile: UserIcon, email: EnvelopeIcon, read: BookIcon, write: PencilIcon, messages: ChatsIcon };

  let busy = $state<'approve' | 'deny' | null>(null);
  function params() {
    const q = page.url.searchParams;
    return {
      client_id: q.get('client_id') ?? '',
      redirect_uri: q.get('redirect_uri') ?? '',
      response_type: q.get('response_type') ?? 'code',
      scope: q.get('scope') ?? '',
      ...(q.get('state') ? { state: q.get('state') } : {}),
      ...(q.get('code_challenge') ? { code_challenge: q.get('code_challenge'), code_challenge_method: q.get('code_challenge_method') ?? 'S256' } : {}),
    };
  }
  async function decide(approve: boolean) {
    busy = approve ? 'approve' : 'deny';
    try {
      const res = await api.post<{ redirect: string }>('/api/oauth/authorize', { ...params(), approve });
      location.href = res.redirect;
    } catch (e) {
      toast.error(errorMessage(e));
      busy = null;
    }
  }
  onMount(() => {
    if (info?.alreadyApproved) void decide(true);
  });
</script>

<svelte:head><title>{info ? `${info.client.name} — ${t('Yetkilendirme')}` : t('Yetkilendirme')}</title></svelte:head>

<main class="flex min-h-dvh items-center justify-center bg-background px-4 py-10" data-part="oauth-consent">
  <div class="w-full max-w-md">
    <div class="mb-6 flex justify-center"><a href="/" aria-label={t('Ana sayfa')}><BrandMark size={36} /></a></div>
    {#if !info}
      <div class="grid justify-items-center gap-3 rounded-xl border bg-card p-8 text-center">
        <WarningIcon class="size-10 text-destructive" weight="duotone" />
        <h1 class="text-lg font-bold">{t('Yetkilendirme isteği geçersiz')}</h1>
        <!-- Yükleyicideki yedek mesaj Türkçe kaynak metindir; sunucu mesajı katalogda yoksa aynen döner. -->
        <p class="text-sm text-muted-foreground">{data.error ? t(data.error) : ''}</p>
        <Button href="/" variant="outline">{t('Foruma dön')}</Button>
      </div>
    {:else if info.alreadyApproved}
      <div class="grid justify-items-center gap-3 rounded-xl border bg-card p-8 text-center">
        <LoaderIcon class="size-8 animate-spin text-primary" />
        <p class="text-sm text-muted-foreground"><b class="text-foreground">{info.client.name}</b> {t('uygulamasına yönlendiriliyorsun…')}</p>
      </div>
    {:else}
      <div class="overflow-hidden rounded-xl border bg-card shadow-card animate-rise">
        <div class="grid justify-items-center gap-4 border-b px-6 pt-7 pb-6 text-center">
          <div class="flex items-center gap-3">
            {#if info.client.logoUrl}<img src={info.client.logoUrl} alt="" class="size-14 rounded-xl object-cover" />{:else}<span class="flex size-14 items-center justify-center rounded-xl bg-muted text-muted-foreground"><AppWindowIcon class="size-7" /></span>{/if}
            <ArrowsIcon class="size-5 text-muted-foreground" />
            <UserAvatar {user} size={56} />
          </div>
          <div>
            <h1 class="text-xl font-extrabold tracking-tight">{info.client.name}</h1>
            <p class="mt-1 text-sm text-muted-foreground">{t('hesabına erişmek istiyor')}</p>
          </div>
          {#if info.client.description}<p class="text-sm text-muted-foreground">{info.client.description}</p>{/if}
        </div>

        <div class="grid gap-3 px-6 py-5">
          <p class="text-xs font-bold tracking-wider text-muted-foreground uppercase"><b class="text-foreground normal-case">{user.displayName}</b> {t('olarak şunlara izin vereceksin:')}</p>
          <ul class="grid gap-3">
            {#each info.scopes as s (s.key)}
              {@const Icon = ICONS[s.key] ?? ShieldIcon}
              <li class="flex items-start gap-3">
                <span class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><Icon class="size-4" /></span>
                <span class="grid"><span class="text-sm font-semibold">{s.label}</span><span class="text-xs text-muted-foreground">{s.description}</span></span>
              </li>
            {/each}
          </ul>
        </div>

        <div class="grid gap-3 border-t bg-muted/20 px-6 py-5">
          <div class="flex gap-2">
            <Button variant="outline" class="flex-1" onclick={() => decide(false)} disabled={busy !== null}>{#if busy === 'deny'}<LoaderIcon class="animate-spin" />{/if}{t('Reddet')}</Button>
            <Button class="flex-1" onclick={() => decide(true)} disabled={busy !== null}>{#if busy === 'approve'}<LoaderIcon class="animate-spin" />{/if}{t('İzin ver')}</Button>
          </div>
          <p class="text-center text-xs text-muted-foreground">
            {t('İzin verince')} <b class="text-foreground">{info.redirectHost}</b> {t('adresine yönlendirileceksin. Şifren uygulamayla paylaşılmaz; erişimi istediğin zaman')}
            <a href="/settings/connections" class="text-link hover:underline">{t('Ayarlar → Bağlantılar')}</a> {t('bölümünden kaldırabilirsin.')}
          </p>
          {#if info.client.homepageUrl}<p class="text-center text-xs"><a href={info.client.homepageUrl} target="_blank" rel="noopener noreferrer" class="text-link hover:underline">{t('Uygulamanın sitesi')}</a></p>{/if}
        </div>
      </div>
      <p class="mt-4 text-center text-xs text-muted-foreground">{t('Sen değil misin?')} <a href="/login?next={encodeURIComponent(page.url.pathname + page.url.search)}" class="text-link hover:underline">{t('Başka hesapla giriş yap')}</a></p>
    {/if}
  </div>
</main>
