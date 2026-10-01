<script lang="ts">
  import CodeIcon from 'phosphor-svelte/lib/Code';
  import { cn } from '$lib/utils';
  import { t, localeTag } from '$lib/i18n.svelte';

  /**
   * Hafif kod düzenleyici: satır numaraları, Tab ile girinti, Shift+Tab ile geri alma.
   * Harici bağımlılık yok; HTML / CSS / JS için yeterli ve hızlı.
   */
  let {
    value = $bindable(''),
    language = 'HTML',
    minHeight = 260,
    maxLength,
    placeholder = '',
    id,
    class: className,
  }: { value?: string; language?: string; minHeight?: number; maxLength?: number; placeholder?: string; id?: string; class?: string } = $props();

  let area = $state<HTMLTextAreaElement | null>(null);
  let gutter = $state<HTMLDivElement | null>(null);
  const lines = $derived(Math.max(1, value.split('\n').length));

  const INDENT = '  ';
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !area) return;
    e.preventDefault();
    const { selectionStart: start, selectionEnd: end } = area;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    if (start === end && !e.shiftKey) {
      value = value.slice(0, start) + INDENT + value.slice(end);
      queueMicrotask(() => area?.setSelectionRange(start + INDENT.length, start + INDENT.length));
      return;
    }
    // Seçili satırları topluca girintile / geri al
    const block = value.slice(lineStart, end);
    const next = e.shiftKey ? block.replace(/^ {1,2}/gm, '') : block.replace(/^/gm, INDENT);
    value = value.slice(0, lineStart) + next + value.slice(end);
    queueMicrotask(() => area?.setSelectionRange(lineStart, lineStart + next.length));
  }
  function syncScroll() {
    if (gutter && area) gutter.scrollTop = area.scrollTop;
  }
</script>

<div class={cn('overflow-hidden rounded-md border bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20', className)} data-part="code-editor">
  <div class="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
    <CodeIcon class="size-3.5" />{language}
    <span class="ml-auto tabular-nums">{t('{lines} satır', { lines })} · {t('{count} karakter', {
        count: value.length.toLocaleString(localeTag()) + (maxLength ? ` / ${maxLength.toLocaleString(localeTag())}` : ''),
      })}</span>
  </div>
  <div class="relative flex" style="height:{minHeight}px">
    <div bind:this={gutter} class="shrink-0 overflow-hidden border-r bg-muted/20 py-2.5 pr-2 pl-3 text-right font-mono text-xs leading-5 text-muted-foreground/70 select-none" aria-hidden="true">
      {#each { length: lines } as _, i (i)}<div>{i + 1}</div>{/each}
    </div>
    <textarea
      bind:this={area}
      bind:value
      {id}
      {placeholder}
      maxlength={maxLength}
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      wrap="off"
      class="min-w-0 flex-1 resize-none overflow-auto bg-transparent px-3 py-2.5 font-mono text-xs leading-5 outline-none placeholder:text-muted-foreground/60"
      {onkeydown}
      onscroll={syncScroll}
    ></textarea>
  </div>
</div>
