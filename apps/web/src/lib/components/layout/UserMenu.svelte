<script lang="ts">
  import type { Viewer } from '@forum/shared';
  import { goto, invalidateAll } from '$app/navigation';
  import UserIcon from 'phosphor-svelte/lib/UserCircle';
  import SettingsIcon from 'phosphor-svelte/lib/GearSix';
  import ShieldIcon from 'phosphor-svelte/lib/ShieldStar';
  import LogOutIcon from 'phosphor-svelte/lib/SignOut';
  import TrophyIcon from 'phosphor-svelte/lib/Trophy';
  import BookmarkIcon from 'phosphor-svelte/lib/BookmarkSimple';
  import ChecksIcon from 'phosphor-svelte/lib/Checks';
  import SunIcon from 'phosphor-svelte/lib/Sun';
  import MoonIcon from 'phosphor-svelte/lib/Moon';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDown';
  import EnvelopeIcon from 'phosphor-svelte/lib/EnvelopeSimple';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { api } from '$lib/api';
  import { can, profileUrl } from '$lib/viewer';
  import { theme } from '$lib/theme.svelte';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';
  import UserAvatar from '../UserAvatar.svelte';

  interface Props {
    viewer: Viewer;
    /** avatar: yalnız avatar; named: avatar + ad + ok */
    variant?: 'avatar' | 'named';
    class?: string;
  }
  let { viewer, variant = 'avatar', class: className }: Props = $props();
  const user = $derived(viewer.user!);

  async function logout() {
    await api.post('/api/auth/logout');
    await invalidateAll();
    await goto('/');
  }
  async function markAllRead() {
    await api.post('/api/forum/mark-read');
    await invalidateAll();
  }
  async function toggleTheme() {
    const next = theme.resolved === 'dark' ? 'light' : 'dark';
    theme.set(next);
    await api.put('/api/me/preferences', { theme: next, timezone: user.timezone }).catch(() => undefined);
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class={cn(
      'flex items-center gap-2 rounded-full outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
      variant === 'named' ? 'py-1 pr-2.5 pl-1 hover:bg-white/10' : 'p-0.5 hover:ring-3 hover:ring-primary/20',
      className,
    )}
    aria-label={t('Hesap menüsü')}
    data-part="user-menu"
  >
    <UserAvatar user={user} size={variant === 'named' ? 32 : 36} />
    {#if variant === 'named'}
      <span class="hidden max-w-36 truncate text-sm font-bold md:block">{user.displayName}</span>
      <CaretDownIcon class="hidden size-3.5 opacity-70 md:block" weight="bold" />
    {/if}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-64">
    <a href={profileUrl(user)} class="flex items-center gap-3 rounded-md p-2 hover:bg-accent">
      <UserAvatar user={user} size={40} />
      <span class="grid min-w-0">
        <span class="truncate font-bold" style={user.color ? `color:${user.color}` : undefined}>{user.displayName}</span>
        <span class="truncate text-xs text-muted-foreground">{user.primaryGroup ? tc(user.primaryGroup.name) : t('Profilini görüntüle')}</span>
      </span>
    </a>
    <DropdownMenu.Separator />
    <DropdownMenu.Item onSelect={() => goto(profileUrl(user))}><UserIcon />{t('Profilim')}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={() => goto('/messages')}><EnvelopeIcon />{t('Mesajlarım')}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={() => goto('/settings/profile')}><SettingsIcon />{t('Hesap ayarları')}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={() => goto('/settings/achievements')}><TrophyIcon />{t('Başarılarım')}</DropdownMenu.Item>
    <DropdownMenu.Separator />
    <DropdownMenu.Item onSelect={() => goto('/unread')}><BookmarkIcon />{t('Okunmamış içerik')}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={markAllRead}><ChecksIcon />{t('Tümünü okundu say')}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={toggleTheme} closeOnSelect={false}>
      {#if theme.resolved === 'dark'}<SunIcon />{t('Açık moda geç')}{:else}<MoonIcon />{t('Koyu moda geç')}{/if}
    </DropdownMenu.Item>
    {#if can(viewer, 'admin.access')}
      <DropdownMenu.Separator />
      <DropdownMenu.Item onSelect={() => goto('/admin')}><ShieldIcon />{t('Yönetim paneli')}</DropdownMenu.Item>
    {/if}
    <DropdownMenu.Separator />
    <DropdownMenu.Item variant="destructive" onSelect={logout}><LogOutIcon />{t('Çıkış yap')}</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
