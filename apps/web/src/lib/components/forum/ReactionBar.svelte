<script lang="ts">
  import type { PostReactionCount, ReactionDef, ReactionUserItem } from '@forum/shared';
  import { toast } from 'svelte-sonner';
  import SmileyIcon from 'phosphor-svelte/lib/Smiley';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import * as Popover from '$lib/components/ui/popover';
  import Emoji from '../Emoji.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import UserName from '../UserName.svelte';
  import { api, errorMessage } from '$lib/api';
  import { goto } from '$app/navigation';
  import { loginHref } from '$lib/nav-auth';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    postId: number;
    defs: ReactionDef[];
    reactions: PostReactionCount[];
    myReaction: number | null;
    canReact: boolean;
    loggedIn: boolean;
  }
  let { postId, defs, reactions: initial, myReaction: initialMine, canReact, loggedIn }: Props = $props();

  let reactions = $derived<PostReactionCount[]>(initial);
  let mine = $derived<number | null>(initialMine);

  const byId = $derived(new Map(defs.map((d) => [d.id, d])));
  const total = $derived(reactions.reduce((a, r) => a + r.count, 0));
  let pickerOpen = $state(false);
  let busy = $state(false);
  let popped = $state<number | null>(null);

  async function react(id: number) {
    if (!loggedIn) return void goto(loginHref());
    if (busy) return;
    busy = true;
    pickerOpen = false;
    const prevR = reactions;
    const prevM = mine;
    const next = mine === id ? null : id;
    const counts = new Map(reactions.map((r) => [r.reactionId, r.count]));
    if (mine) counts.set(mine, (counts.get(mine) ?? 1) - 1);
    if (next) counts.set(next, (counts.get(next) ?? 0) + 1);
    reactions = [...counts].filter(([, n]) => n > 0).map(([reactionId, count]) => ({ reactionId, count })).sort((a, b) => b.count - a.count);
    mine = next;
    if (next) popped = next;
    try {
      const res = await api.put<{ reactions: PostReactionCount[]; myReaction: number | null }>(`/api/posts/${postId}/reaction`, { reactionId: id });
      reactions = res.reactions;
      mine = res.myReaction;
      who = null;
    } catch (e) {
      reactions = prevR;
      mine = prevM;
      toast.error(errorMessage(e));
    } finally {
      busy = false;
      setTimeout(() => (popped = null), 500);
    }
  }

  let who = $state<ReactionUserItem[] | null>(null);
  let whoTab = $state<number | null>(null);
  async function loadWho() {
    if (who) return;
    try {
      who = await api.get<ReactionUserItem[]>(`/api/posts/${postId}/reactions`);
    } catch {
      who = [];
    }
  }
  const whoShown = $derived((who ?? []).filter((w) => !whoTab || w.reactionId === whoTab));
</script>

{#if defs.length && (total > 0 || canReact)}
  <div class="flex flex-wrap items-center gap-1.5" data-part="reactions">
    {#each reactions as r (r.reactionId)}
      {@const d = byId.get(r.reactionId)}
      {#if d}
        <button
          type="button"
          onclick={() => canReact && react(d.id)}
          disabled={!canReact}
          title={d.label}
          class={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-full border px-2 text-xs font-bold tabular-nums transition-[background-color,border-color,transform] duration-200 disabled:cursor-default',
            mine === d.id ? 'border-primary/50 bg-primary-soft text-highlight' : 'bg-muted/40 hover:border-primary/30 hover:bg-accent',
            canReact && 'active:scale-95',
          )}
        >
          <Emoji emoji={d.emoji} size={16} class={cn(popped === d.id && 'animate-pop')} />{r.count}
        </button>
      {/if}
    {/each}

    {#if canReact}
      <Popover.Root bind:open={pickerOpen}>
        <Popover.Trigger
          class="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          aria-label={t('Tepki ver')}
        >
          <SmileyIcon class="size-4" weight="duotone" />{#if !total}{t('Tepki ver')}{/if}
        </Popover.Trigger>
        <Popover.Content side="top" align="start" class="w-auto rounded-full p-1.5">
          <div class="flex items-center gap-0.5">
            {#each defs as d, i (d.id)}
              <button
                type="button"
                onclick={() => react(d.id)}
                title={d.label}
                aria-label={d.label}
                style="--i:{i}"
                class={cn(
                  'group/r relative flex size-9 items-center justify-center rounded-full transition-transform duration-200 ease-[var(--ease-spring)] animate-rise hover:-translate-y-1.5 hover:scale-125',
                  mine === d.id && 'bg-primary-soft',
                )}
              >
                <Emoji emoji={d.emoji} size={24} />
                <span class="pointer-events-none absolute -top-7 rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-background opacity-0 transition-opacity group-hover/r:opacity-100">{d.label}</span>
              </button>
            {/each}
          </div>
        </Popover.Content>
      </Popover.Root>
    {:else if !loggedIn && !total}
      <a href={loginHref()} class="text-xs text-muted-foreground hover:text-foreground">{t('Tepki vermek için giriş yap')}</a>
    {/if}

    {#if total > 0}
      <Popover.Root onOpenChange={(o) => o && loadWho()}>
        <Popover.Trigger class="ml-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">
          {t('{n} tepki', { n: total })}
        </Popover.Trigger>
        <Popover.Content align="start" class="w-72 gap-0 p-0">
          <div class="scrollbar-none flex gap-1 overflow-x-auto border-b p-1.5">
            <button type="button" class={cn('rounded-lg px-2.5 py-1 text-xs font-bold', !whoTab ? 'bg-accent' : 'text-muted-foreground hover:bg-accent')} onclick={() => (whoTab = null)}>{t('Tümü {n}', { n: total })}</button>
            {#each reactions as r (r.reactionId)}
              {@const d = byId.get(r.reactionId)}
              {#if d}
                <button type="button" class={cn('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold', whoTab === d.id ? 'bg-accent' : 'text-muted-foreground hover:bg-accent')} onclick={() => (whoTab = d.id)}>
                  <Emoji emoji={d.emoji} size={14} />{r.count}
                </button>
              {/if}
            {/each}
          </div>
          <div class="max-h-72 overflow-y-auto p-1.5">
            {#if who === null}
              <div class="flex justify-center p-4"><LoaderIcon class="size-5 animate-spin text-muted-foreground" /></div>
            {:else}
              {#each whoShown as w (w.user.id)}
                {@const d = byId.get(w.reactionId)}
                <div class="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                  <span class="relative">
                    <UserAvatar user={w.user} size={30} />
                    {#if d}<Emoji emoji={d.emoji} size={14} class="absolute -right-1 -bottom-1" />{/if}
                  </span>
                  <UserName user={w.user} class="text-sm font-semibold" />
                </div>
              {/each}
            {/if}
          </div>
        </Popover.Content>
      </Popover.Root>
    {/if}
  </div>
{/if}
