<script lang="ts">
  /** Kurulum sihirbazındaki tema kartları için küçük, canlı önizleme (gerçek temayı yüklemeden). */
  let { theme, accent, mode }: { theme: 'modern' | 'community' | 'classic'; accent: string; mode: 'dark' | 'light' } = $props();
  const dark = $derived(mode === 'dark');
  const bg = $derived(dark ? '#12141b' : '#f4f5f9');
  const card = $derived(dark ? '#1b1e28' : '#ffffff');
  const line = $derived(dark ? '#2a2e3b' : '#e3e5ec');
  const text = $derived(dark ? '#e7e9f0' : '#1c1f2a');
  const muted = $derived(dark ? '#3a3f4f' : '#d5d8e1');
</script>

<svg viewBox="0 0 160 100" class="block w-full" aria-hidden="true">
  <rect width="160" height="100" fill={theme === 'classic' ? '#5f7e9c' : bg} />
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
  {:else}
    <rect x="12" y="6" width="136" height="90" fill="#fff" />
    <rect x="12" y="6" width="136" height="16" fill="#35536f" />
    <rect x="18" y="11" width="30" height="6" fill="#fff" opacity="0.9" />
    <rect x="52" y="25" width="56" height="6" rx="3" fill={accent} />
    <rect x="16" y="35" width="128" height="7" fill="#7f99b4" />
    {#each [0, 1, 2, 3] as i (i)}
      <rect x="16" y={44 + i * 12} width="12" height="10" fill="#e3e9f0" />
      <rect x="30" y={44 + i * 12} width="74" height="10" fill="#f0f3f7" />
      <rect x="34" y={47 + i * 12} width="36" height="3" fill="#35536f" />
      <rect x="106" y={44 + i * 12} width="38" height="10" fill="#e3e9f0" />
    {/each}
  {/if}
</svg>
