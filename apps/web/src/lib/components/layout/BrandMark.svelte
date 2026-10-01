<script lang="ts">
  import { page } from '$app/state';
  import { theme } from '$lib/theme.svelte';
  import { cn } from '$lib/utils';

  interface Props {
    /** Logo yüksekliği (px); yazı logoda punto buna göre ayarlanır */
    size?: number;
    /** Logo yoksa forum adını yazı logo olarak göster */
    withName?: boolean;
    class?: string;
    nameClass?: string;
    /** Logonun üzerinde durduğu yüzey: auto = temaya göre, dark = koyu zemin (banner), light = açık zemin */
    surface?: 'auto' | 'dark' | 'light';
  }
  let { size = 36, withName = true, class: className, nameClass, surface = 'auto' }: Props = $props();

  const s = $derived(page.data.viewer?.settings ?? {});
  const forumName = $derived(String(s['general.forumName'] ?? 'Forum'));
  const light = $derived(surface === 'auto' ? theme.resolved === 'light' : surface === 'light');
  const logo = $derived((light && s['appearance.logoLightUrl'] ? s['appearance.logoLightUrl'] : s['appearance.logoUrl']) as string | null | undefined);
  const showName = $derived(withName && !!logo && s['appearance.showForumName'] === true);
</script>

<span class={cn('flex min-w-0 items-center gap-2.5', className)} data-part="brand">
  {#if logo}
    <img src={logo} alt={forumName} class="w-auto object-contain" style="height:{size}px;max-width:{size * 6}px" />
    {#if showName}<span class={cn('truncate text-[1.05rem] font-extrabold tracking-tight', nameClass)}>{forumName}</span>{/if}
  {:else if withName}
    <!-- Logo yüklenmediyse: forum adından yazı logo -->
    <span
      class={cn('truncate leading-none font-black tracking-[-0.03em]', nameClass)}
      style="font-size:{Math.round(size * 0.62)}px"
      data-part="wordmark"
    >
      {forumName}<span class="text-primary">.</span>
    </span>
  {:else}
    <span
      class="flex shrink-0 items-center justify-center rounded-[calc(var(--radius)*0.8)] bg-primary font-black text-primary-foreground"
      style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.5)}px"
      aria-hidden="true">{forumName.trim().charAt(0).toLocaleUpperCase('tr-TR') || 'F'}</span
    >
  {/if}
</span>
