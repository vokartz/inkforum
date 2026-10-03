<script lang="ts">
  import { LANG_COOKIE, LOCALES, LOCALE_INFO, type Locale } from '@forum/shared';
  import { page } from '$app/state';
  import TranslateIcon from 'phosphor-svelte/lib/Translate';
  import CheckIcon from 'phosphor-svelte/lib/Check';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { api } from '$lib/api';
  import { i18n, t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';

  let { variant = 'text', class: className }: { variant?: 'text' | 'icon'; class?: string } = $props();

  const settings = $derived(page.data.viewer?.settings ?? {});
  const enabled = $derived(((settings['i18n.enabledLocales'] as Locale[] | undefined)?.length ? (settings['i18n.enabledLocales'] as Locale[]) : [...LOCALES]).filter((l) => LOCALES.includes(l)));
  const loggedIn = $derived(!!page.data.viewer?.user);

  const flagSrc = (l: Locale) => `/emoji/${[...LOCALE_INFO[l].flag].map((c) => c.codePointAt(0)!.toString(16)).join('-')}.svg`;

  async function choose(locale: Locale) {
    document.cookie = `${LANG_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    if (loggedIn) await api.put('/api/me/language', { locale }).catch(() => undefined);
    window.location.reload();
  }
</script>

{#if enabled.length > 1}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      class={cn(
        'inline-flex items-center gap-1.5 rounded-md text-inherit transition-colors hover:text-foreground',
        variant === 'icon' && 'size-9 justify-center hover:bg-accent',
        className,
      )}
      aria-label={t('Dil seç')}
      data-part="language-picker"
    >
      <TranslateIcon class="size-4" />
      {#if variant === 'text'}<span>{LOCALE_INFO[i18n.locale].name}</span>{/if}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="min-w-44">
      {#each enabled as l (l)}
        <DropdownMenu.Item onclick={() => choose(l)} class="gap-2.5">
          <img src={flagSrc(l)} alt="" aria-hidden="true" class="h-3.5 w-5 shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" loading="lazy" decoding="async" />

          <span class="flex-1">{LOCALE_INFO[l].name}</span>
          {#if l === i18n.locale}<CheckIcon class="size-4 text-primary" />{/if}
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}
