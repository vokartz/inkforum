<script lang="ts">
  import { deferScripts, fillTemplate, runScripts, type TemplateVars } from '$lib/custom-code';
  import { useCustomVars } from '$lib/custom-vars';
  import { cn } from '$lib/utils';

  /**
   * Yöneticinin ham HTML / JS kodu. Sunucuda betikler etkisiz çizilir; tarayıcıda öğe takılınca
   * sırayla çalışır. İçerik değişirse (ör. başka bir profile geçiş) öğe yeniden kurulur.
   */
  let { html, vars = {}, class: className, part = 'custom-html' }: { html: string; vars?: TemplateVars; class?: string; part?: string } = $props();

  const base = useCustomVars();
  const prepared = $derived(deferScripts(fillTemplate(html, { ...base(), ...vars })));
</script>

{#key prepared}
  <div class={cn('custom-html', className)} data-part={part} use:runScripts>{@html prepared}</div>
{/key}
