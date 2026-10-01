<script lang="ts">
  import { navigating } from '$app/state';
  import { t } from '$lib/i18n.svelte';

  // Kısa geçişlerde titreme olmasın diye çubuk 150 ms gecikmeyle görünür.
  let visible = $state(false);
  let done = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const active = !!navigating.to;
    clearTimeout(timer);
    if (active) {
      clearTimeout(hideTimer);
      done = false;
      timer = setTimeout(() => (visible = true), 150);
    } else if (visible) {
      done = true;
      hideTimer = setTimeout(() => {
        visible = false;
        done = false;
      }, 350);
    }
  });
</script>

{#if visible}
  <div
    class="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden transition-opacity duration-300 {done ? 'opacity-0' : 'opacity-100'}"
    role="progressbar"
    aria-label={t('Sayfa yükleniyor')}
    data-part="nav-progress"
  >
    <div class="absolute inset-0 bg-primary/20"></div>
    {#if done}
      <div class="absolute inset-y-0 left-0 w-full bg-primary transition-[width] duration-300"></div>
    {:else}
      <div class="absolute inset-y-0 left-0 w-2/5 bg-primary shadow-[0_0_10px_var(--primary)]" style="animation: forum-progress 1.1s ease-in-out infinite"></div>
    {/if}
  </div>
{/if}
