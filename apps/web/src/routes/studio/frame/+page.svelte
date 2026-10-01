<script lang="ts">
  import type { ResolvedBlock } from '@forum/shared';
  import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUp';
  import ArrowDownIcon from 'phosphor-svelte/lib/ArrowDown';
  import CopyIcon from 'phosphor-svelte/lib/CopySimple';
  import TrashIcon from 'phosphor-svelte/lib/Trash';
  import PlusIcon from 'phosphor-svelte/lib/Plus';
  import BlockView from '$lib/components/builder/BlockView.svelte';
  import CustomHtml from '$lib/components/CustomHtml.svelte';
  import { BUILDER_BLOCKS } from '@forum/shared';
  import { STUDIO_MSG, type FromFrame, type ToFrame } from '$lib/components/builder/studio';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';


  let mode = $state<'blocks' | 'html' | 'prose' | 'wait'>('wait');
  let blocks = $state<ResolvedBlock[]>([]);
  let selectedId = $state<string | null>(null);
  let css = $state('');
  let html = $state('');
  let title = $state<string | null>(null);
  let standalone = $state(true);

  const send = (msg: FromFrame) => window.parent.postMessage({ ns: STUDIO_MSG, msg }, location.origin);

  $effect(() => {
    // Yalnızca aynı kökenden, bu çerçeveyi açan Stüdyo'dan gelen mesajlar
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== window.parent || e.data?.ns !== STUDIO_MSG) return;
      const m = e.data.msg as ToFrame;
      if (m.type === 'blocks') {
        mode = 'blocks';
        blocks = m.blocks;
        selectedId = m.selectedId;
        css = m.css;
        standalone = m.standalone;
      } else if (m.type === 'html') {
        mode = 'html';
        html = m.html;
      } else if (m.type === 'prose') {
        mode = 'prose';
        html = m.html;
        title = m.title;
      } else if (m.type === 'scroll') {
        document.getElementById(`blk-${m.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    window.addEventListener('message', onMessage);
    // Stüdyo henüz dinlemiyor olabilir (çerçeve ondan önce yüklenebilir): ilk mesaj gelene kadar tekrarlanır
    send({ type: 'ready' });
    const ping = setInterval(() => (mode === 'wait' ? send({ type: 'ready' }) : clearInterval(ping)), 400);
    return () => {
      clearInterval(ping);
      window.removeEventListener('message', onMessage);
    };
  });

  // Önizlemede bağlantılar ve formlar çalışmaz; tıklama bloğu seçer
  function guard(e: MouseEvent) {
    const el = e.target as Element;
    if (el.closest('[data-studio-ui]')) return;
    if (el.closest('a, button, summary, input, select, form')) e.preventDefault();
  }
  const edge = (b: ResolvedBlock | undefined) => !!b && (b.width === 'full' || b.type === 'navbar' || b.type === 'footer');
</script>

<svelte:head>
  <title>{t('Önizleme')}</title>
  {#if css}{@html `<style>${css}</style>`}{/if}
</svelte:head>

<svelte:window onclickcapture={guard} onsubmitcapture={(e) => e.preventDefault()} />

{#if mode === 'blocks'}
  <div class={cn('flow-root', standalone && 'flex min-h-dvh flex-col')} data-part="builder-page">
    {#each blocks as b, i (b.id)}
      {@const sel = selectedId === b.id}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        id="blk-{b.id}"
        class={cn(
          'group/blk relative scroll-mt-20 outline-2 -outline-offset-2 transition-[outline-color]',
          sel ? 'outline outline-primary' : 'outline-transparent hover:outline hover:outline-primary/40',
          i > 0 && !(edge(blocks[i - 1]) && edge(b)) && 'mt-8 sm:mt-10',
          standalone && !edge(b) && 'mx-auto w-full max-w-7xl px-4 sm:px-6',
          standalone && b.type === 'footer' && 'mt-auto',
        )}
        onclick={() => send({ type: 'select', id: b.id })}
      >
        <div data-studio-ui class={cn('absolute top-2 left-2 z-[60] items-center gap-0.5 rounded-md bg-primary py-0.5 pr-0.5 pl-2 text-[11px] font-bold text-primary-foreground shadow-lg', sel ? 'flex' : 'hidden group-hover/blk:flex')}>
          {t(BUILDER_BLOCKS[b.type].label)}
          <button type="button" class="ml-1 rounded p-1 hover:bg-black/20" onclick={() => send({ type: 'action', action: 'up', id: b.id })} title={t('Yukarı')}><ArrowUpIcon class="size-3.5" /></button>
          <button type="button" class="rounded p-1 hover:bg-black/20" onclick={() => send({ type: 'action', action: 'down', id: b.id })} title={t('Aşağı')}><ArrowDownIcon class="size-3.5" /></button>
          <button type="button" class="rounded p-1 hover:bg-black/20" onclick={() => send({ type: 'action', action: 'duplicate', id: b.id })} title={t('Çoğalt')}><CopyIcon class="size-3.5" /></button>
          <button type="button" class="rounded p-1 hover:bg-black/20" onclick={() => send({ type: 'action', action: 'remove', id: b.id })} title={t('Sil')}><TrashIcon class="size-3.5" /></button>
        </div>
        <BlockView block={b} editing />
        <button
          type="button"
          data-studio-ui
          onclick={(e) => (e.stopPropagation(), send({ type: 'action', action: 'insert', id: b.id }))}
          class="absolute -bottom-4 left-1/2 z-[60] hidden size-8 -translate-x-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-lg group-hover/blk:flex hover:border-primary hover:text-primary"
          title={t('Altına blok ekle')}
        >
          <PlusIcon class="size-4" weight="bold" />
        </button>
      </div>
    {:else}
      <div class="grid min-h-dvh place-items-center p-10 text-center text-sm text-muted-foreground">{t('Sayfa boş. Soldaki "Blok ekle" ile başlayın ya da bir şablon seçin.')}</div>
    {/each}
  </div>
{:else if mode === 'html'}
  {#key html}<CustomHtml {html} part="custom-page" />{/key}
{:else if mode === 'prose'}
  <div class="mx-auto max-w-4xl px-5 py-8">
    {#if title}<h1 class="mb-5 border-b pb-4 text-3xl font-extrabold tracking-tight">{title}</h1>{/if}
    <div class="prose-forum">{@html html}</div>
  </div>
{:else}
  <div class="grid min-h-dvh place-items-center text-sm text-muted-foreground">{t('Yükleniyor…')}</div>
{/if}
