<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { REALTIME_EVENT } from '$lib/realtime.svelte';

  let { children } = $props();

  onMount(() => {
    const onEvent = (e: Event) => {
      const type = (e as CustomEvent<{ type: string }>).detail.type;
      if (type === 'message' || type === 'counters') void invalidate('app:messages');
    };
    window.addEventListener(REALTIME_EVENT, onEvent);
    return () => window.removeEventListener(REALTIME_EVENT, onEvent);
  });
</script>

{@render children()}
