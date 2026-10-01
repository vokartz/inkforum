<script lang="ts">
  import type { HomeBlock } from '@forum/shared';
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import XIcon from 'phosphor-svelte/lib/X';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRight';
  import NodeIcon from '../NodeIcon.svelte';
  import { t } from '$lib/i18n.svelte';

  let { block }: { block: Extract<HomeBlock, { kind: 'announcement' }> } = $props();

  const KEY = 'forum:dismissed-announcements';
  let hidden = $state(false);

  onMount(() => {
    try {
      hidden = (JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]).includes(block.key);
    } catch {
      /* depolama kapalı */
    }
  });

  function dismiss() {
    hidden = true;
    try {
      const list = (JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]).filter((k) => !k.startsWith(`${block.id}:`));
      localStorage.setItem(KEY, JSON.stringify([...list, block.key].slice(-50)));
    } catch {
      /* yoksay */
    }
  }

  const TONES: Record<string, string> = {
    accent: 'var(--primary)',
    info: 'oklch(0.65 0.14 240)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--destructive)',
    neutral: 'var(--muted-foreground)',
  };
  const tone = $derived(TONES[block.style] ?? TONES.accent);
  const external = $derived(!!block.linkUrl && /^https?:/i.test(block.linkUrl));
</script>

{#if !hidden}
  <div
    out:slide={{ duration: 200 }}
    data-part="announcement"
    data-style={block.style}
    class="flex items-center gap-3 rounded-[var(--radius)] border bg-card px-4 py-3 text-sm"
    style="--tone:{tone}"
  >
    {#if block.icon}
      <span class="shrink-0 text-[var(--tone)]"><NodeIcon nodes={block.icon} size={20} /></span>
    {/if}
    <div class="min-w-0 flex-1 leading-relaxed">
      {#if block.title}<span class="mr-1.5 font-bold">{block.title}</span>{/if}
      <span class="prose-forum text-muted-foreground [&_p]:inline [&_strong]:text-foreground">{@html block.html}</span>
    </div>
    {#if block.linkUrl}
      <a
        href={block.linkUrl}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        class="hidden shrink-0 items-center gap-1 text-sm font-semibold text-foreground hover:underline sm:inline-flex"
      >
        {block.linkLabel || t('Ayrıntılar')}<CaretRightIcon class="size-3.5" weight="bold" />
      </a>
    {/if}
    {#if block.dismissible}
      <button type="button" onclick={dismiss} class="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label={t('Duyuruyu kapat')}>
        <XIcon class="size-4" />
      </button>
    {/if}
  </div>
{/if}
