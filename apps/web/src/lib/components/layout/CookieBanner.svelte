<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import CookieIcon from 'phosphor-svelte/lib/Cookie';
  import { Button } from '$lib/components/ui/button';
  import { t } from '$lib/i18n.svelte';

  let { text }: { text: string } = $props();
  const KEY = 'forum_cookie_notice';
  let show = $state(false);

  onMount(() => {
    show = !document.cookie.split('; ').some((c) => c.startsWith(`${KEY}=`));
  });

  function dismiss() {
    document.cookie = `${KEY}=1; Path=/; Max-Age=31536000; SameSite=Lax`;
    show = false;
  }
</script>

{#if show}
  <div
    transition:fly={{ y: 24, duration: 250 }}
    role="region"
    aria-label={t('Çerez bildirimi')}
    data-part="cookie-banner"
    class="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border bg-popover p-4 text-sm text-popover-foreground shadow-2xl sm:flex-row sm:items-center"
  >
    <CookieIcon class="hidden size-6 shrink-0 text-primary sm:block" />
    <p class="flex-1 text-muted-foreground">{text} <a href="/cookies" class="font-medium text-link underline-offset-2 hover:underline">{t('Ayrıntılar')}</a></p>
    <div class="flex shrink-0 gap-2">
      <Button size="sm" onclick={dismiss}>{t('Anladım')}</Button>
    </div>
  </div>
{/if}
