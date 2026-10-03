<script lang="ts">
  import { emojiCode } from '@forum/shared';
  import { cn } from '$lib/utils';

  interface Props {
    emoji: string;
    size?: number;
    class?: string;
    label?: string;
  }
  let { emoji, size, class: className, label }: Props = $props();
</script>

<!-- Twemoji görseli: her cihazda aynı görünüm -->
<img
  src="/emoji/{emojiCode(emoji)}.svg"
  alt={emoji}
  title={label}
  draggable="false"
  loading="lazy"
  class={cn('inline-block shrink-0 align-[-0.2em] select-none', !size && 'size-[1.25em]', className)}
  style={size ? `width:${size}px;height:${size}px` : undefined}
/>
