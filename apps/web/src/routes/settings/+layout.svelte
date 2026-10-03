<script lang="ts">
  import { page } from '$app/state';
  import UserIcon from 'phosphor-svelte/lib/User';
  import AtSignIcon from 'phosphor-svelte/lib/At';
  import KeyIcon from 'phosphor-svelte/lib/Key';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheck';
  import MonitorSmartphoneIcon from 'phosphor-svelte/lib/Devices';
  import EyeOffIcon from 'phosphor-svelte/lib/EyeSlash';
  import SlidersIcon from 'phosphor-svelte/lib/SlidersHorizontal';
  import UsersIcon from 'phosphor-svelte/lib/Users';
  import BellIcon from 'phosphor-svelte/lib/Bell';
  import TriangleAlertIcon from 'phosphor-svelte/lib/Warning';
  import TrophyIcon from 'phosphor-svelte/lib/Trophy';
  import FileTextIcon from 'phosphor-svelte/lib/FileText';
  import PlugsIcon from 'phosphor-svelte/lib/PlugsConnected';
  import { can } from '$lib/viewer';
  import NodeIcon from '$lib/components/NodeIcon.svelte';
  import { t } from '$lib/i18n.svelte';

  let { data, children } = $props();

  const sections = $derived([
    {
      title: t('Profil'),
      items: [
        { href: '/settings/profile', label: t('Profil'), icon: UserIcon },
        { href: '/settings/account', label: t('Hesap'), icon: AtSignIcon },
        { href: '/settings/privacy', label: t('Gizlilik'), icon: EyeOffIcon },
        { href: '/settings/preferences', label: t('Tercihler'), icon: SlidersIcon },
      ],
    },
    {
      title: t('Güvenlik'),
      items: [
        { href: '/settings/password', label: t('Şifre'), icon: KeyIcon },
        { href: '/settings/security', label: t('İki adımlı doğrulama'), icon: ShieldCheckIcon },
        { href: '/settings/sessions', label: t('Oturumlar'), icon: MonitorSmartphoneIcon },
        { href: '/settings/connections', label: t('Bağlantılar'), icon: PlugsIcon },
      ],
    },
    {
      title: t('Topluluk'),
      items: [
        { href: '/settings/groups', label: t('Gruplarım'), icon: UsersIcon },
        { href: '/settings/notifications', label: t('Bildirimler'), icon: BellIcon },
        ...(can(data.viewer, 'warnings.view.own') ? [{ href: '/settings/warnings', label: t('Uyarılarım'), icon: TriangleAlertIcon }] : []),
        { href: '/settings/achievements', label: t('Başarılarım'), icon: TrophyIcon },
        { href: '/settings/policies', label: t('Onay geçmişi'), icon: FileTextIcon },
      ],
    },
  ]);
</script>

<div class="grid gap-8 md:grid-cols-[220px_1fr]">
  <aside class="md:sticky md:top-20 md:self-start">
    <nav class="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:px-0 md:gap-4 md:overflow-visible md:pb-0">
      {#each sections as section (section.title)}
        <div class="contents md:grid md:gap-0.5">
          <p class="hidden px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:block">{section.title}</p>
          {#each section.items as item (item.href)}
            <a
              href={item.href}
              class="flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm whitespace-nowrap {page.url.pathname === item.href
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}"
            >
              <item.icon class="size-4" />{item.label}
            </a>
          {/each}
        </div>
      {/each}
      {#if data.extPages.length}
        <div class="contents md:grid md:gap-0.5" data-part="settings-ext">
          <p class="hidden px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:block">{t('Eklentiler')}</p>
          {#each data.extPages as item (`${item.ext}/${item.key}`)}
            {@const href = `/settings/ext/${item.ext}/${item.key}`}
            <a
              {href}
              class="flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm whitespace-nowrap {page.url.pathname === href
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}"
            >
              <NodeIcon nodes={item.iconNode} size={16} />{item.title}
            </a>
          {/each}
        </div>
      {/if}
    </nav>
  </aside>
  <div class="min-w-0">{@render children()}</div>
</div>
