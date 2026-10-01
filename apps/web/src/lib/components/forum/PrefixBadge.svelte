<script lang="ts">
  import type { TopicPrefix } from '@forum/shared';
  import { cn } from '$lib/utils';

  let { prefix, class: className }: { prefix: TopicPrefix; class?: string } = $props();
</script>

<span
  data-part="topic-prefix"
  class={cn('inline-flex shrink-0 items-center rounded-md px-1.5 py-px align-middle text-[11px] font-semibold tracking-wide uppercase', className)}
  style="background:color-mix(in oklch, {prefix.color ?? 'var(--primary)'} 18%, transparent);color:{prefix.color ?? 'var(--primary)'}"
>
  {prefix.name}
</span>
