<script lang="ts">
  import { effectivePalette, themeConfigSchema, type ThemeConfig } from '@forum/shared';

  /** Temanın küçük, canlı önizlemesi (gerçek sayfayı yüklemeden; paletten çizilir) */
  let { config, mode = null }: { config: ThemeConfig; mode?: 'light' | 'dark' | null } = $props();
  const c = $derived(themeConfigSchema.parse(config));
  const m = $derived(mode ?? (c.mode.default === 'light' ? 'light' : 'dark'));
  const p = $derived(effectivePalette(c, m));
  const r = $derived({ none: 0, sm: 2, md: 4, lg: 6, xl: 9 }[c.shape.radius]);
  const bg = $derived(
    c.background.kind === 'gradient' && c.background.from && c.background.to
      ? `linear-gradient(${c.background.angle}deg, ${c.background.from}, ${c.background.to})`
      : p.background,
  );
  const banner = $derived(c.header.style !== 'topbar');
</script>

<div
  class="relative aspect-[16/10] w-full overflow-hidden"
  style="background:{bg};font-size:0"
  aria-hidden="true"
>
  {#if banner}
    <div
      class="flex h-[22%] items-center px-[6%]"
      style="background:{p.header};justify-content:{c.header.style === 'centered' ? 'center' : 'flex-start'}"
    >
      <span class="h-[30%] w-[26%]" style="background:{p.headerText};opacity:.9;border-radius:{r / 2}px"
      ></span>
    </div>
  {/if}
  <div
    class="flex h-[11%] items-center gap-[3%] px-[6%]"
    style="background:{p.nav};border-bottom:1px solid {p.border};justify-content:{c.header.style ===
    'centered'
      ? 'center'
      : 'flex-start'}"
  >
    {#if !banner}<span class="h-[34%] w-[14%]" style="background:{p.navText};opacity:.85;border-radius:2px"
      ></span>{/if}
    <span
      class="h-[30%] w-[9%]"
      style="background:{c.accent};border-radius:{c.header.nav === 'pill' ? 99 : 2}px"
    ></span>
    <span class="h-[22%] w-[8%]" style="background:{p.navText};opacity:.4;border-radius:2px"></span>
    <span class="h-[22%] w-[8%]" style="background:{p.navText};opacity:.4;border-radius:2px"></span>
  </div>
  <div
    class="grid gap-[3%] p-[5%]"
    style="grid-template-columns:{c.layout.sidebar === 'hidden'
      ? '1fr'
      : c.layout.sidebar === 'left'
        ? '28% 1fr'
        : '1fr 28%'}"
  >
    <div
      class="overflow-hidden"
      style="background:{p.surface};border:1px solid {c.shape.cards === 'bordered'
        ? p.border
        : 'transparent'};border-radius:{r}px;order:{c.layout.sidebar === 'left' ? 2 : 0}"
    >
      <div
        class="h-[14px] px-[6%] pt-[5px]"
        style="background:{c.forumList.categoryHeader === 'filled'
          ? c.accent
          : c.forumList.categoryHeader === 'tinted'
            ? `color-mix(in oklab, ${c.accent} 12%, ${p.surface})`
            : 'transparent'}"
      >
        <div
          class="h-[4px] w-[30%]"
          style="background:{c.forumList.categoryHeader === 'filled' ? '#fff' : p.text};border-radius:2px"
        ></div>
      </div>
      {#each [0, 1, 2] as i (i)}
        <div class="flex items-center gap-[5%] px-[6%] py-[5px]" style="border-top:1px solid {p.border}">
          <span
            class="size-[9px] shrink-0"
            style="background:{i === 0 ? c.accent : p.surfaceAlt};border-radius:{r / 2}px"
          ></span>
          <span class="h-[4px] w-[38%]" style="background:{p.text};opacity:.8;border-radius:2px"></span>
          <span class="ml-auto h-[3px] w-[18%]" style="background:{p.muted};opacity:.7;border-radius:2px"
          ></span>
        </div>
      {/each}
    </div>
    {#if c.layout.sidebar !== 'hidden'}
      <div
        style="background:{p.surface};border:1px solid {c.shape.cards === 'bordered'
          ? p.border
          : 'transparent'};border-radius:{r}px"
      ></div>
    {/if}
  </div>
</div>
