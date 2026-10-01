<script lang="ts">
  import type { Paginated, UserSummary } from '@forum/shared';
  import { Input } from '$lib/components/ui/input';
  import { api } from '$lib/api';
  import { t } from '$lib/i18n.svelte';
  import UserAvatar from './UserAvatar.svelte';

  interface Props {
    placeholder?: string;
    exclude?: number[];
    onpick: (user: UserSummary) => void;
  }
  let { placeholder = t('Üye ara…'), exclude = [], onpick }: Props = $props();

  let query = $state('');
  let results = $state<UserSummary[]>([]);
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function search() {
    clearTimeout(timer);
    const q = query.trim();
    if (q.length < 2) {
      results = [];
      return;
    }
    timer = setTimeout(async () => {
      try {
        const res = await api.get<Paginated<{ user: UserSummary }>>(`/api/members?q=${encodeURIComponent(q)}&perPage=8&sort=name&dir=asc`);
        results = res.items.map((i) => i.user).filter((u) => !exclude.includes(u.id));
        open = true;
      } catch {
        results = [];
      }
    }, 200);
  }

  function pick(u: UserSummary) {
    onpick(u);
    query = '';
    results = [];
    open = false;
  }
</script>

<div class="relative">
  <Input bind:value={query} oninput={search} onfocus={() => (open = results.length > 0)} {placeholder} autocomplete="off" />
  {#if open && results.length}
    <ul class="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md">
      {#each results as u (u.id)}
        <li>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            onclick={() => pick(u)}
          >
            <UserAvatar user={u} size={22} />
            <span style={u.color ? `color:${u.color}` : undefined} class="font-medium">{u.displayName}</span>
            <span class="text-xs text-muted-foreground">@{u.username}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
