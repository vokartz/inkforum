<script lang="ts">
  import ForumIndexView from '$lib/components/forum/ForumIndexView.svelte';

  let { data } = $props();
</script>

<ForumIndexView data={{ ...data.index, viewer: data.viewer }} />
