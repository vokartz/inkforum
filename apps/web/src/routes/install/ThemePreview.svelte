<script lang="ts">
  import type { ThemeStyle } from '@forum/shared';
  /** Kurulum sihirbazındaki tema kartları için küçük, canlı önizleme (gerçek temayı yüklemeden). */
  let { theme, accent, mode }: { theme: ThemeStyle; accent: string; mode: 'dark' | 'light' } = $props();
  const dark = $derived(mode === 'dark');
  const bg = $derived(dark ? '#12141b' : '#f4f5f9');
  const card = $derived(dark ? '#1b1e28' : '#ffffff');
  const line = $derived(dark ? '#2a2e3b' : '#e3e5ec');
  const text = $derived(dark ? '#e7e9f0' : '#1c1f2a');
  const muted = $derived(dark ? '#3a3f4f' : '#d5d8e1');
  const paper = $derived(dark ? '#171511' : '#f5f1e8');
  const paperCard = $derived(dark ? '#1d1a15' : '#fffdf8');
  const ink = $derived(dark ? '#ece5d8' : '#26221c');
  const rule = $derived(dark ? '#332e26' : '#d9d0bd');
</script>

<svg viewBox="0 0 160 100" class="block w-full" aria-hidden="true">
  <rect width="160" height="100" fill={theme === 'editorial' ? paper : theme === 'nova' ? (dark ? '#14171c' : '#f2f4f7') : bg} />
  {#if theme === 'modern'}
    <rect width="160" height="16" fill={card} />
    <rect x="8" y="5" width="22" height="6" rx="3" fill={accent} />
    <rect x="40" y="6" width="14" height="4" rx="2" fill={muted} /><rect x="58" y="6" width="14" height="4" rx="2" fill={muted} />
    {#each [0, 1, 2] as i (i)}
      <rect x="10" y={24 + i * 24} width="140" height="19" rx="5" fill={card} stroke={line} />
      <rect x="16" y={29 + i * 24} width="9" height="9" rx="3" fill={accent} opacity="0.85" />
      <rect x="30" y={30 + i * 24} width="50" height="3.5" rx="1.7" fill={text} opacity="0.8" />
      <rect x="30" y={36 + i * 24} width="34" height="2.5" rx="1.2" fill={muted} />
    {/each}
  {:else if theme === 'community'}
    <rect width="160" height="34" fill={accent} opacity="0.9" />
    <rect width="160" height="34" fill="url(#cg)" />
    <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity="0.35" /></linearGradient></defs>
    <rect x="10" y="10" width="36" height="7" rx="2" fill="#fff" />
    <rect x="10" y="20" width="56" height="3" rx="1.5" fill="#fff" opacity="0.6" />
    <rect x="0" y="34" width="160" height="10" fill={card} />
    <rect x="10" y="37.5" width="12" height="3" rx="1.5" fill={accent} /><rect x="26" y="37.5" width="12" height="3" rx="1.5" fill={muted} />
    <rect x="10" y="50" width="96" height="44" rx="4" fill={card} stroke={line} />
    <rect x="10" y="50" width="96" height="8" rx="4" fill={accent} opacity="0.2" />
    {#each [0, 1, 2] as i (i)}<rect x="16" y={63 + i * 10} width="60" height="3" rx="1.5" fill={muted} />{/each}
    <rect x="112" y="50" width="38" height="44" rx="4" fill={card} stroke={line} />
  {:else if theme === 'nova'}
    <rect width="160" height="30" fill={dark ? '#141c2a' : '#1d2b44'} />
    <rect width="160" height="30" fill={accent} opacity="0.35" />
    <rect x="10" y="8" width="30" height="7" rx="1" fill="#fff" />
    <rect x="104" y="8" width="46" height="7" rx="1.5" fill="#fff" opacity="0.18" />
    <rect x="10" y="22" width="20" height="8" rx="1.5" fill={dark ? '#1f2633' : '#eef2f8'} />
    <rect x="35" y="25" width="14" height="2.5" rx="1" fill="#fff" opacity="0.55" /><rect x="54" y="25" width="14" height="2.5" rx="1" fill="#fff" opacity="0.55" />
    <rect x="0" y="30" width="160" height="9" fill={dark ? '#1f2633' : '#eef2f8'} />
    <rect x="10" y="33" width="20" height="2.5" rx="1" fill={muted} /><rect x="34" y="33" width="20" height="2.5" rx="1" fill={muted} />
    <rect x="132" y="32" width="18" height="5" rx="1" fill={accent} />
    <rect x="10" y="45" width="140" height="49" rx="2" fill={card} stroke={line} />
    <rect x="10" y="45" width="140" height="9" rx="2" fill={accent} opacity="0.16" />
    <rect x="15" y="48" width="38" height="3" rx="1" fill={accent} />
    {#each [0, 1, 2] as i (i)}
      <rect x="10" y={54 + i * 13} width="140" height="0.6" fill={line} />
      <rect x="15" y={58 + i * 13} width="7" height="7" rx="1.5" fill={accent} opacity="0.7" />
      <rect x="26" y={59 + i * 13} width="50" height="2.5" rx="1" fill={text} opacity="0.75" />
      <rect x="26" y={63 + i * 13} width="34" height="2" rx="1" fill={muted} />
      <rect x="112" y={59 + i * 13} width="32" height="2.5" rx="1" fill={muted} />
    {/each}
  {:else}
    <rect x="10" y="4" width="30" height="2.5" fill={rule} /><rect x="128" y="4" width="22" height="2.5" fill={rule} />
    <rect x="0" y="10" width="160" height="0.6" fill={rule} />
    <rect x="52" y="16" width="56" height="9" rx="1" fill={ink} />
    <rect x="62" y="28" width="36" height="2.5" fill={rule} />
    <rect x="0" y="35" width="160" height="0.6" fill={rule} /><rect x="0" y="37" width="160" height="0.6" fill={rule} />
    <rect x="44" y="39.5" width="14" height="2.5" fill={accent} /><rect x="64" y="39.5" width="14" height="2.5" fill={rule} /><rect x="84" y="39.5" width="14" height="2.5" fill={rule} /><rect x="104" y="39.5" width="14" height="2.5" fill={rule} />
    <rect x="0" y="44" width="160" height="0.6" fill={rule} />
    <rect x="12" y="51" width="136" height="43" fill={paperCard} stroke={rule} stroke-width="0.6" />
    <rect x="18" y="56" width="44" height="4.5" fill={ink} opacity="0.85" />
    <rect x="18" y="63" width="124" height="0.5" fill={rule} /><rect x="18" y="64.3" width="124" height="0.5" fill={rule} />
    {#each [0, 1, 2] as i (i)}
      <rect x="18" y={69 + i * 8} width="64" height="3" fill={ink} opacity="0.55" />
      <rect x="120" y={69 + i * 8} width="22" height="2.5" fill={rule} />
    {/each}
  {/if}
</svg>
