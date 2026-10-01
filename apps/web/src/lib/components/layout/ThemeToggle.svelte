<script lang="ts">
  import SunIcon from 'phosphor-svelte/lib/Sun';
  import MoonIcon from 'phosphor-svelte/lib/Moon';
  import SparklesIcon from 'phosphor-svelte/lib/Sparkle';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import ChevronUpIcon from 'phosphor-svelte/lib/CaretUp';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { buttonVariants } from '$lib/components/ui/button';
  import { theme, type ThemePreference } from '$lib/theme.svelte';
  import { api } from '$lib/api';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';
  import { page } from '$app/state';
  import { themeOptions } from '$lib/theme-options';

  interface Props {
    loggedIn: boolean;
    timezone: string;
    /** icon: yalnızca ikon düğmesi; text: alt bilgideki "Tema" bağlantısı */
    variant?: 'icon' | 'text';
    class?: string;
  }
  let { loggedIn, timezone, variant = 'icon', class: className }: Props = $props();

  async function choose(pref: ThemePreference) {
    // Renk geçişi yumuşak olsun (View Transitions destekleniyorsa).
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const apply = () => theme.set(pref);
    if (doc.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(apply);
    else apply();
    if (loggedIn) {
      try {
        await api.put('/api/me/preferences', { theme: pref, timezone });
      } catch {
        /* tercih kaydedilemese de yerel tema uygulanır */
      }
    }
  }

  // Etkin tema tek bir renk modu kullanıyorsa seçici gizlenir
  const locked = $derived(themeOptions(page.data.viewer?.settings)?.mode.toggle === false);
  const defaultLabel = $derived(theme.forumDefault === 'dark' ? t('Koyu') : theme.forumDefault === 'light' ? t('Açık') : t('Cihaz'));
  const options = $derived<Array<{ value: ThemePreference; label: string; icon: typeof SunIcon }>>([
    { value: 'dark', label: t('Koyu'), icon: MoonIcon },
    { value: 'light', label: t('Açık'), icon: SunIcon },
    { value: 'system', label: t('Forum varsayılanı ({label})', { label: defaultLabel }), icon: SparklesIcon },
  ]);
</script>

{#if !locked}
<DropdownMenu.Root>
  {#if variant === 'icon'}
    <DropdownMenu.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), className)} aria-label={t('Renk modu')}>
      {#if theme.resolved === 'dark'}<MoonIcon />{:else}<SunIcon />{/if}
    </DropdownMenu.Trigger>
  {:else}
    <DropdownMenu.Trigger class={cn('inline-flex items-center gap-1 hover:text-foreground', className)}>{t('Tema')}<ChevronUpIcon class="size-3.5" /></DropdownMenu.Trigger>
  {/if}
  <DropdownMenu.Content align={variant === 'icon' ? 'end' : 'center'} class="w-60">
    {#each options as opt (opt.value)}
      <DropdownMenu.Item onSelect={() => choose(opt.value)}>
        <opt.icon />{opt.label}
        {#if theme.preference === opt.value}<CheckIcon class="ml-auto" />{/if}
      </DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
{/if}
