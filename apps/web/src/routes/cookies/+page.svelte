<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import CookieIcon from 'phosphor-svelte/lib/Cookie';
  import Trash2Icon from 'phosphor-svelte/lib/Trash';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheck';
  import BroomIcon from 'phosphor-svelte/lib/Broom';
  import ClockIcon from 'phosphor-svelte/lib/Clock';
  import HardDrivesIcon from 'phosphor-svelte/lib/HardDrives';
  import { cn } from '$lib/utils';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { api } from '$lib/api';
  import { confirmAction } from '$lib/confirm.svelte';
  import { t } from '$lib/i18n.svelte';

  let { data } = $props();
  let alsoLogout = $state(false);

  const cookies = [
    { name: 'forum_sid / __Host-forum_sid', purpose: 'Oturumunuzu açık tutar (giriş yaptığınızda).', kind: 'Zorunlu', duration: 'Oturum veya 30 gün (beni hatırla)' },
    { name: 'forum_theme', purpose: 'Seçtiğiniz renk modunu (açık/koyu) hatırlar.', kind: 'Tercih', duration: '1 yıl' },
    { name: 'forum_cookie_notice', purpose: 'Çerez bildirimini kapattığınızı hatırlar.', kind: 'Tercih', duration: '1 yıl' },
  ];
  const storage = ['Yazdığınız mesaj taslakları', 'Daraltılmış kategoriler', 'Editör modu (görsel/BBCode)', 'Çoklu alıntı seçimleri'];

  async function clearAll() {
    const ok = await confirmAction({
      title: t('Çerezler ve yerel veriler temizlensin mi?'),
      description: alsoLogout ? t('Oturumunuz da kapatılacak.') : t('Tercihleriniz ve kaydedilmemiş taslaklarınız silinecek.'),
      confirmLabel: t('Temizle'),
      destructive: true,
    });
    if (!ok) return;
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
    }
    for (const c of document.cookie.split(';')) {
      const name = c.split('=')[0]?.trim();
      if (name) document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
    if (alsoLogout && data.viewer.user) {
      try {
        await api.post('/api/auth/logout');
      } catch {
      }
    }
    toast.success(t('Çerezler ve yerel veriler temizlendi.'));
    await invalidateAll();
  }
</script>

<PageHeader title={t('Çerezler')} description={t('Bu forumun tarayıcınızda sakladığı veriler ve bunları nasıl temizleyebileceğiniz.')} />

<div class="mb-6 grid gap-3 sm:grid-cols-3" data-part="cookie-summary">
  {#each [{ icon: ShieldCheckIcon, title: t('Reklam çerezi yok'), text: t('Sizi izleyen ya da reklam gösteren üçüncü taraf çerez kullanılmaz.') }, { icon: CookieIcon, title: t('Yalnızca gerekli çerezler'), text: t('Oturumunuz ve tercihleriniz için birkaç küçük çerez.') }, { icon: BroomIcon, title: t('Tek tıkla temizlenir'), text: t('Bu tarayıcıdaki tüm forum verilerini istediğiniz an silebilirsiniz.') }] as f (f.title)}
    <div class="flex gap-3 rounded-2xl border bg-card p-4 shadow-card">
      <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><f.icon class="size-5" weight="duotone" /></span>
      <div class="grid gap-0.5">
        <p class="text-sm font-bold">{f.title}</p>
        <p class="text-xs text-muted-foreground">{f.text}</p>
      </div>
    </div>
  {/each}
</div>

<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
  <Card.Root>
    <Card.Header>
      <Card.Title class="flex items-center gap-2 text-base"><CookieIcon class="size-5 text-primary" />{t('Kullanılan çerezler')}</Card.Title>
      <Card.Description>{t('Reklam veya izleme çerezi kullanılmaz. Gömülü içerikler (YouTube, Spotify vb.) kendi çerezlerini kullanabilir.')}</Card.Description>
    </Card.Header>
    <Card.Content class="p-0">
      <ul class="divide-y border-y">
        {#each cookies as c (c.name)}
          <li class="grid gap-1 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
            <div class="grid min-w-0 gap-1">
              <div class="flex flex-wrap items-center gap-2">
                <code class="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">{c.name}</code>
                <span class={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', c.kind === 'Zorunlu' ? 'bg-primary-soft text-highlight' : 'bg-muted text-muted-foreground')}>{t(c.kind)}</span>
              </div>
              <p class="text-sm text-muted-foreground">{t(c.purpose)}</p>
            </div>
            <span class="flex items-center gap-1.5 text-xs text-muted-foreground sm:justify-end"><ClockIcon class="size-3.5" />{t(c.duration)}</span>
          </li>
        {/each}
      </ul>
      <div class="grid gap-2 px-5 py-4">
        <p class="flex items-center gap-2 text-sm font-semibold"><HardDrivesIcon class="size-4 text-muted-foreground" />{t('Tarayıcı depolaması')}</p>
        <div class="flex flex-wrap gap-1.5">
          {#each storage as item (item)}<span class="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">{t(item)}</span>{/each}
        </div>
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root class="lg:sticky lg:top-24">
    <Card.Header>
      <Card.Title class="flex items-center gap-2 text-base"><BroomIcon class="size-5 text-destructive" />{t('Çerezleri temizle')}</Card.Title>
      <Card.Description>{t('Bu tarayıcıda saklanan forum çerezlerini ve yerel verileri siler.')}</Card.Description>
    </Card.Header>
    <Card.Content class="grid gap-4">
      {#if data.viewer.user}
        <label class="flex items-center gap-3 text-sm"><Switch bind:checked={alsoLogout} />{t('Oturumumu da kapat')}</label>
      {/if}
      <Button variant="destructive" class="w-full" onclick={clearAll}><Trash2Icon />{t('Çerezleri temizle')}</Button>
      <p class="text-xs text-muted-foreground">{t('Gizlilikle ilgili ayrıntılar için')} <a href="/policies/privacy" class="text-link hover:underline">{t('Gizlilik Politikası')}</a>.</p>
    </Card.Content>
  </Card.Root>
</div>
