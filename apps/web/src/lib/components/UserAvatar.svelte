<script lang="ts">
  import { page } from '$app/state';
  import { cn } from '$lib/utils';

  interface Props {
    user: { displayName: string; avatarUrl: string | null; color?: string | null };
    size?: number;
    shape?: 'circle' | 'rounded';
    class?: string;
  }
  let { user, size = 32, shape = 'circle', class: className }: Props = $props();

  const fallback = $derived((page.data.viewer?.settings?.['appearance.defaultAvatarUrl'] as string | null | undefined) ?? null);
  const src = $derived(user.avatarUrl ?? fallback);
  const radius = $derived(shape === 'circle' ? 'rounded-full' : 'rounded-[22%]');
</script>

{#if src}
  <img
    src={src}
    alt={user.displayName}
    width={size}
    height={size}
    loading="lazy"
    class={cn('shrink-0 bg-muted object-cover ring-1 ring-border', radius, className)}
    style="width:{size}px;height:{size}px"
    data-part="avatar"
  />
{:else}
  <svg
    viewBox="0 0 64 64"
    width={size}
    height={size}
    role="img"
    aria-label={user.displayName}
    class={cn('shrink-0 overflow-hidden ring-1 ring-border', radius, className)}
    style="width:{size}px;height:{size}px"
    data-part="avatar"
  >
    <defs>
      <linearGradient id="av-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--surface-2)" />
        <stop offset="1" stop-color="var(--muted)" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" fill="url(#av-bg)" />
    <circle cx="32" cy="25" r="11.5" fill="var(--muted-foreground)" opacity="0.55" />
    <path d="M9 64c1.5-13 11-21 23-21s21.5 8 23 21z" fill="var(--muted-foreground)" opacity="0.55" />
  </svg>
{/if}
