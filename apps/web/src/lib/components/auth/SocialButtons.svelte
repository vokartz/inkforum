<script lang="ts">
  import BrandIcon from '../BrandIcon.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  /** Etkin sosyal giriş sağlayıcıları: "Discord ile devam et" düğmeleri. */
  let { providers, next = '/', mode = 'login', class: className }: { providers: Array<{ key: string; label: string }>; next?: string; mode?: 'login' | 'link'; class?: string } = $props();
</script>

{#if providers.length}
  <div class={cn('grid gap-2', className)} data-part="social-buttons">
    {#each providers as p (p.key)}
      <a
        href="/api/auth/social/{p.key}/start?mode={mode}&next={encodeURIComponent(next)}"
        data-sveltekit-reload
        class="press flex h-11 items-center justify-center gap-2.5 rounded-md border bg-card text-sm font-semibold transition-colors hover:bg-accent"
      >
        <BrandIcon platform={p.key} size={16} badge class="!size-6" />
        {t('{provider} ile devam et', { provider: p.label })}
      </a>
    {/each}
  </div>
{/if}
