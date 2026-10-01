<script lang="ts">
  import { formatDateTime, timeAgo } from '$lib/format';

  let { ms, class: className }: { ms: number | null | undefined; class?: string } = $props();
</script>

{#if ms}
  <time datetime={new Date(ms).toISOString()} title={formatDateTime(ms)} class={className}>{timeAgo(ms)}</time>
{:else}
  <span class={className}>—</span>
{/if}
