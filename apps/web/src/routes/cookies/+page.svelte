<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import CookieIcon from 'phosphor-svelte/lib/Cookie';
  import Trash2Icon from 'phosphor-svelte/lib/Trash';
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
      /* depolama kapalı */
    }
    // JavaScript'ten erişilebilen (httpOnly olmayan) çerezleri sil.
    for (const c of document.cookie.split(';')) {
      const name = c.split('=')[0]?.trim();
      if (name) document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
    if (alsoLogout && data.viewer.user) {
      try {
        await api.post('/api/auth/logout');
      } catch {
        /* yoksay */
      }
    }
    toast.success(t('Çerezler ve yerel veriler temizlendi.'));
    await invalidateAll();
  }
</script>

<PageHeader title={t('Çerezler')} description={t('Bu forumun tarayıcınızda sakladığı veriler ve bunları nasıl temizleyebileceğiniz.')} />

<div class="grid max-w-3xl gap-6">
  <Card.Root>
    <Card.Header>
      <Card.Title class="flex items-center gap-2 text-base"><CookieIcon class="size-5 text-primary" />{t('Kullanılan çerezler')}</Card.Title>
      <Card.Description>{t('Reklam veya izleme çerezi kullanılmaz. Gömülü içerikler (YouTube, Spotify vb.) kendi çerezlerini kullanabilir.')}</Card.Description>
    </Card.Header>
    <Card.Content class="grid gap-3">
      {#each cookies as c (c.name)}
        <div class="rounded-xl border p-3">
          <div class="flex flex-wrap items-center gap-2">
            <code class="text-sm font-semibold">{c.name}</code>
            <span class="rounded-full bg-muted px-2 py-0.5 text-xs">{t(c.kind)}</span>
            <span class="ml-auto text-xs text-muted-foreground">{t(c.duration)}</span>
          </div>
          <p class="mt-1 text-sm text-muted-foreground">{t(c.purpose)}</p>
        </div>
      {/each}
      <div class="rounded-xl border border-dashed p-3 text-sm">
        <p class="font-medium">{t('Tarayıcı depolaması')}</p>
        <p class="mt-1 text-muted-foreground">{storage.map((s) => t(s)).join(' · ')}</p>
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title class="text-base">{t('Çerezleri temizle')}</Card.Title>
      <Card.Description>{t('Bu tarayıcıda saklanan forum çerezlerini ve yerel verileri siler.')}</Card.Description>
    </Card.Header>
    <Card.Content class="grid gap-4">
      {#if data.viewer.user}
        <label class="flex items-center gap-3 text-sm"><Switch bind:checked={alsoLogout} />{t('Oturumumu da kapat')}</label>
      {/if}
      <div><Button variant="destructive" onclick={clearAll}><Trash2Icon />{t('Çerezleri temizle')}</Button></div>
    </Card.Content>
  </Card.Root>
</div>
