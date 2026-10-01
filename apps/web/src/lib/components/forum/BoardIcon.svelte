<script lang="ts">
  import type { BoardIcon } from '@forum/shared';
  import ChatsIcon from 'phosphor-svelte/lib/ChatsCircle';
  import LinkIcon from 'phosphor-svelte/lib/LinkSimple';
  import NodeIcon from '../NodeIcon.svelte';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    icon: BoardIcon;
    unread?: boolean;
    redirect?: boolean;
    size?: number;
    class?: string;
  }
  let { icon, unread = false, redirect = false, size = 48, class: className }: Props = $props();

  // Tek tonlu: okunmamış içerik varsa vurgu (ya da bölümün kendi) rengi, yoksa sakin gri.
  const tint = $derived(icon.color ?? 'var(--primary)');
  const glyph = $derived(Math.round(size * 0.54));
  // Görsel ikonlarda zemin yok; okunmamışta vurgu tonu, aksi halde sınıftaki gri zemin.
  const bg = $derived(icon.kind === 'image' && icon.url ? 'transparent' : unread ? 'color-mix(in oklch, var(--board-icon) 14%, transparent)' : '');
</script>

<span
  data-part="board-icon"
  data-unread={unread || undefined}
  class={cn(
    'relative inline-flex shrink-0 items-center justify-center rounded-lg transition-[background-color,color,box-shadow,transform] duration-300',
    unread ? 'text-[var(--board-icon)]' : 'bg-muted text-muted-foreground',
    className,
  )}
  style="--board-icon:{tint};width:{size}px;height:{size}px;background:{bg}"
  title={unread ? t('Okunmamış içerik var') : redirect ? t('Bağlantı') : t('Yeni içerik yok')}
>
  {#if icon.kind === 'image' && icon.url}
    <img src={icon.url} alt="" class="size-full rounded-[inherit] object-cover" loading="lazy" />
  {:else if icon.kind === 'icon' && icon.nodes}
    <NodeIcon nodes={icon.nodes} size={glyph} />
  {:else if redirect}
    <LinkIcon style="width:{glyph}px;height:{glyph}px" weight="duotone" />
  {:else}
    <ChatsIcon style="width:{glyph}px;height:{glyph}px" weight="duotone" />
  {/if}
  {#if unread}
    <span class="absolute -top-1 -right-1 flex size-3.5 items-center justify-center" aria-hidden="true">
      <span class="relative size-2.5 rounded-full border-2 border-card bg-[var(--board-icon)]"></span>
    </span>
  {/if}
</span>
