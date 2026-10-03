<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import type { Editor as TiptapEditor } from '@tiptap/core';
  import { bbcodeToDoc, docToBBCode, BB_FONTS, resolveEmbed } from '@forum/shared';
  import { page } from '$app/state';
  import { customEmoji, loadCustomEmojis } from '$lib/custom-emoji';
  import { toast } from 'svelte-sonner';
  import BoldIcon from 'phosphor-svelte/lib/TextB';
  import ItalicIcon from 'phosphor-svelte/lib/TextItalic';
  import UnderlineIcon from 'phosphor-svelte/lib/TextUnderline';
  import StrikethroughIcon from 'phosphor-svelte/lib/TextStrikethrough';
  import ListIcon from 'phosphor-svelte/lib/ListBullets';
  import ListOrderedIcon from 'phosphor-svelte/lib/ListNumbers';
  import QuoteIcon from 'phosphor-svelte/lib/Quotes';
  import CodeIcon from 'phosphor-svelte/lib/Code';
  import EyeOffIcon from 'phosphor-svelte/lib/EyeSlash';
  import LinkIcon from 'phosphor-svelte/lib/Link';
  import ImageIcon from 'phosphor-svelte/lib/Image';
  import VideoIcon from 'phosphor-svelte/lib/YoutubeLogo';
  import TableIcon from 'phosphor-svelte/lib/Table';
  import MinusIcon from 'phosphor-svelte/lib/Minus';
  import SmileIcon from 'phosphor-svelte/lib/Smiley';
  import UndoIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
  import RedoIcon from 'phosphor-svelte/lib/ArrowClockwise';
  import AlignLeftIcon from 'phosphor-svelte/lib/TextAlignLeft';
  import AlignCenterIcon from 'phosphor-svelte/lib/TextAlignCenter';
  import AlignRightIcon from 'phosphor-svelte/lib/TextAlignRight';
  import AlignJustifyIcon from 'phosphor-svelte/lib/TextAlignJustify';
  import PaletteIcon from 'phosphor-svelte/lib/Palette';
  import TypeIcon from 'phosphor-svelte/lib/TextT';
  import HeadingIcon from 'phosphor-svelte/lib/TextH';
  import BracesIcon from 'phosphor-svelte/lib/BracketsCurly';
  import EyeIcon from 'phosphor-svelte/lib/Eye';
  import PenLineIcon from 'phosphor-svelte/lib/PenNib';
  import SubscriptIcon from 'phosphor-svelte/lib/TextSubscript';
  import SuperscriptIcon from 'phosphor-svelte/lib/TextSuperscript';
  import LoaderIcon from 'phosphor-svelte/lib/CircleNotch';
  import UploadIcon from 'phosphor-svelte/lib/UploadSimple';
  import * as Popover from '$lib/components/ui/popover';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { api, errorMessage } from '$lib/api';
  import { previewBBCode } from '$lib/bbcode';
  import { cn } from '$lib/utils';
  import { t, localeTag } from '$lib/i18n.svelte';
  import ToolButton from './ToolButton.svelte';
  import EmojiPicker from '../EmojiPicker.svelte';

  interface Props {
    value?: string;
    id?: string;
    placeholder?: string;
    boardId?: number | null;
    uploadUrl?: string | null;
    maxLength?: number;
    compact?: boolean;
    minHeight?: number;
    draftKey?: string | null;
    mentions?: boolean;
    invalid?: boolean;
    disabled?: boolean;
    previewKind?: 'post' | 'short';
    onsubmit?: () => void;
    class?: string;
  }

  let {
    value = $bindable(''),
    id,
    placeholder = t('Mesajınızı yazın…'),
    boardId = null,
    uploadUrl = null,
    maxLength,
    compact = false,
    minHeight = 180,
    draftKey = null,
    mentions = true,
    invalid = false,
    disabled = false,
    previewKind = 'post',
    onsubmit,
    class: className,
  }: Props = $props();

  const MODE_KEY = 'forum:editor-mode';
  const COLORS = ['#000000', '#475569', '#dc2626', '#ea580c', '#d97706', '#65a30d', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#c026d3', '#db2777'];
  const SIZES = [
    { v: '10px', label: 'Çok küçük' },
    { v: '12px', label: 'Küçük' },
    { v: '14px', label: 'Normal' },
    { v: '16px', label: 'Orta' },
    { v: '20px', label: 'Büyük' },
    { v: '24px', label: 'Çok büyük' },
    { v: '32px', label: 'Dev' },
  ];

  let host = $state<HTMLDivElement | null>(null);
  let textarea = $state<HTMLTextAreaElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let editor = $state<TiptapEditor | null>(null);
  let mode = $state<'visual' | 'source'>('visual');
  let preview = $state(false);
  let previewHtml = $state('');
  let previewLoading = $state(false);
  let uploading = $state(0);
  let tick = $state(0);
  let lastEmitted = '';
  let linkUrl = $state('');
  let linkOpen = $state(false);
  let imageUrl = $state('');
  let imageOpen = $state(false);
  let mediaUrl = $state('');
  let mediaOpen = $state(false);
  let draftTimer: ReturnType<typeof setTimeout> | undefined;

  const length = $derived([...(value ?? '')].length);
  const embedsOn = $derived(page.data.viewer?.settings?.['embeds.enabled'] !== false);
  const over = $derived(!!maxLength && length > maxLength);

  function emit(bb: string) {
    lastEmitted = bb;
    value = bb;
    scheduleDraft();
  }

  function scheduleDraft() {
    if (!draftKey) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try {
        if (value?.trim()) localStorage.setItem(`draft:${draftKey}`, value);
        else localStorage.removeItem(`draft:${draftKey}`);
      } catch {
      }
    }, 600);
  }

  export function clearDraft() {
    clearTimeout(draftTimer);
    try {
      if (draftKey) localStorage.removeItem(`draft:${draftKey}`);
    } catch {
    }
  }

  export function focus() {
    if (mode === 'visual') editor?.commands.focus('end');
    else textarea?.focus();
  }

  export function insertBBCode(bb: string) {
    preview = false;
    const next = (value?.trim() ? value.replace(/\s+$/, '') + '\n' : '') + bb;
    setValue(next);
    queueMicrotask(() => focus());
  }

  const toDoc = (bb: string) => bbcodeToDoc(bb, { customEmoji });

  function setValue(bb: string) {
    emit(bb);
    if (mode === 'visual' && editor) editor.commands.setContent(toDoc(bb), { emitUpdate: false });
  }

  $effect(() => {
    const v = value ?? '';
    untrack(() => {
      if (v === lastEmitted) return;
      lastEmitted = v;
      if (mode === 'visual' && editor) editor.commands.setContent(toDoc(v), { emitUpdate: false });
    });
  });

  async function uploadFiles(files: File[]): Promise<void> {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    const target = uploadUrl ?? (boardId ? `/api/forum/images?board=${boardId}` : null);
    if (!target) {
      toast.error(t('Bu alanda görsel yüklenemez; görsel adresi ekleyebilirsiniz.'));
      return;
    }
    for (const f of images) {
      uploading++;
      try {
        const res = await api.upload<{ url: string }>(target, f, f.name);
        insertImage(res.url);
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        uploading--;
      }
    }
  }

  function insertImage(url: string) {
    if (mode === 'visual' && editor) editor.chain().focus().setImage({ src: url }).run();
    else wrapSource(`[img]${url}`, '[/img]', true);
  }

  onMount(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === 'source') mode = 'source';
    } catch {
    }
    if (draftKey && !value?.trim()) {
      try {
        const draft = localStorage.getItem(`draft:${draftKey}`);
        if (draft) {
          emit(draft);
          toast.info(t('Kaydedilmemiş taslağınız geri yüklendi.'));
        }
      } catch {
      }
    }
    lastEmitted = value ?? '';
    let destroyed = false;
    void (async () => {
      const [{ Editor }, { buildExtensions }] = await Promise.all([import('@tiptap/core'), import('./extensions'), loadCustomEmojis()]);
      if (destroyed || !host) return;
      let frame = 0;
      editor = new Editor({
        element: host,
        extensions: buildExtensions({ placeholder, mentions }),
        content: toDoc(value ?? ''),
        editable: !disabled,
        editorProps: {
          attributes: {
            class: 'prose-forum bb-editor-content outline-none',
            ...(id ? { id } : {}),
            'aria-label': placeholder,
            role: 'textbox',
            'aria-multiline': 'true',
          },
          handlePaste: (_view, event) => {
            const files = [...(event.clipboardData?.files ?? [])];
            if (files.some((f) => f.type.startsWith('image/'))) {
              void uploadFiles(files);
              return true;
            }
            const text = event.clipboardData?.getData('text/plain')?.trim() ?? '';
            if (embedsOn && /^https?:\/\/\S+$/i.test(text) && resolveEmbed(text, { host: location.hostname })) {
              editor?.chain().focus().insertContent({ type: 'media', attrs: { src: text } }).run();
              return true;
            }
            return false;
          },
          handleDrop: (_view, event) => {
            const files = [...((event as DragEvent).dataTransfer?.files ?? [])];
            if (files.some((f) => f.type.startsWith('image/'))) {
              event.preventDefault();
              void uploadFiles(files);
              return true;
            }
            return false;
          },
          handleKeyDown: (_view, event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && onsubmit) {
              event.preventDefault();
              onsubmit();
              return true;
            }
            return false;
          },
        },
        onUpdate: ({ editor: ed }) => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => emit(docToBBCode(ed.getJSON() as never)));
        },
        onTransaction: () => {
          tick++;
        },
      });
    })();
    return () => {
      destroyed = true;
    };
  });

  onDestroy(() => {
    editor?.destroy();
    clearTimeout(draftTimer);
  });

  function setMode(next: 'visual' | 'source') {
    if (next === mode) return;
    preview = false;
    if (next === 'visual' && editor) editor.commands.setContent(toDoc(value ?? ''), { emitUpdate: false });
    mode = next;
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
    }
    queueMicrotask(() => focus());
  }

  async function togglePreview() {
    preview = !preview;
    if (!preview) return;
    previewLoading = true;
    try {
      previewHtml = (value ?? '').trim() ? await previewBBCode(value ?? '', previewKind) : `<p class="text-muted-foreground">${t('Önizlenecek bir şey yok.')}</p>`;
    } catch (e) {
      previewHtml = `<p class="text-destructive">${errorMessage(e)}</p>`;
    } finally {
      previewLoading = false;
    }
  }

  function wrapSource(open: string, close: string, replaceSelection = false) {
    const ta = textarea;
    const v = value ?? '';
    if (!ta) {
      emit(v + open + close);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = replaceSelection ? '' : v.slice(start, end);
    const next = v.slice(0, start) + open + sel + close + v.slice(end);
    emit(next);
    queueMicrotask(() => {
      ta.focus();
      const pos = start + open.length + sel.length;
      ta.setSelectionRange(sel ? start : pos, pos);
    });
  }

  function onSourceKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onsubmit) {
      e.preventDefault();
      onsubmit();
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const map: Record<string, [string, string]> = { b: ['[b]', '[/b]'], i: ['[i]', '[/i]'], u: ['[u]', '[/u]'] };
    const m = map[e.key.toLowerCase()];
    if (m) {
      e.preventDefault();
      wrapSource(m[0], m[1]);
    }
  }

  type Cmd =
    | 'bold' | 'italic' | 'underline' | 'strike' | 'sub' | 'sup'
    | 'bullet' | 'ordered' | 'quote' | 'code' | 'spoiler' | 'hr' | 'table' | 'undo' | 'redo';

  const SOURCE: Record<Cmd, [string, string] | null> = {
    bold: ['[b]', '[/b]'],
    italic: ['[i]', '[/i]'],
    underline: ['[u]', '[/u]'],
    strike: ['[s]', '[/s]'],
    sub: ['[sub]', '[/sub]'],
    sup: ['[sup]', '[/sup]'],
    bullet: ['[list]\n[*]', '\n[/list]'],
    ordered: ['[list=1]\n[*]', '\n[/list]'],
    quote: ['[quote]\n', '\n[/quote]'],
    code: ['[code]\n', '\n[/code]'],
    spoiler: ['[spoiler]\n', '\n[/spoiler]'],
    hr: ['[hr]\n', ''],
    table: [`[table]\n[tr][th]${t('Başlık')}[/th][th]${t('Başlık')}[/th][/tr]\n[tr][td]`, '[/td][td][/td][/tr]\n[/table]'],
    undo: null,
    redo: null,
  };

  function run(cmd: Cmd) {
    if (mode === 'source') {
      const s = SOURCE[cmd];
      if (s) wrapSource(s[0], s[1]);
      return;
    }
    const c = editor?.chain().focus();
    if (!c) return;
    switch (cmd) {
      case 'bold': c.toggleBold().run(); break;
      case 'italic': c.toggleItalic().run(); break;
      case 'underline': c.toggleUnderline().run(); break;
      case 'strike': c.toggleStrike().run(); break;
      case 'sub': c.toggleSubscript().run(); break;
      case 'sup': c.toggleSuperscript().run(); break;
      case 'bullet': c.toggleBulletList().run(); break;
      case 'ordered': c.toggleOrderedList().run(); break;
      case 'quote': c.toggleBlockquote().run(); break;
      case 'code': c.toggleCodeBlock().run(); break;
      case 'spoiler': c.wrapIn('spoiler', { title: null }).run(); break;
      case 'hr': c.setHorizontalRule().run(); break;
      case 'table': c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
      case 'undo': c.undo().run(); break;
      case 'redo': c.redo().run(); break;
    }
  }

  function heading(level: 0 | 2 | 3 | 4) {
    if (mode === 'source') {
      if (level) wrapSource(`[h${level}]`, `[/h${level}]`);
      return;
    }
    const c = editor?.chain().focus();
    if (!c) return;
    if (level) c.toggleHeading({ level }).run();
    else c.setParagraph().run();
  }

  function active(name: string, attrs?: Record<string, unknown>): boolean {
    void tick;
    return mode === 'visual' && !!editor?.isActive(name, attrs);
  }

  function align(a: 'left' | 'center' | 'right' | 'justify') {
    if (mode === 'source') {
      if (a !== 'left') wrapSource(`[${a}]`, `[/${a}]`);
      return;
    }
    editor?.chain().focus().setTextAlign(a).run();
  }

  function color(c: string | null) {
    if (mode === 'source') {
      if (c) wrapSource(`[color=${c}]`, '[/color]');
      return;
    }
    if (c) editor?.chain().focus().setColor(c).run();
    else editor?.chain().focus().unsetColor().run();
  }

  function size(px: string | null) {
    if (mode === 'source') {
      if (px) wrapSource(`[size=${px}]`, '[/size]');
      return;
    }
    if (px) editor?.chain().focus().setFontSize(px).run();
    else editor?.chain().focus().unsetFontSize().run();
  }

  function font(f: string | null) {
    if (mode === 'source') {
      if (f) wrapSource(`[font=${f.includes(' ') ? `"${f}"` : f}]`, '[/font]');
      return;
    }
    if (f) editor?.chain().focus().setFontFamily(f).run();
    else editor?.chain().focus().unsetFontFamily().run();
  }

  function applyLink() {
    const url = linkUrl.trim();
    linkOpen = false;
    if (mode === 'source') {
      if (url) wrapSource(`[url=${url}]`, '[/url]');
      return;
    }
    if (!url) editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    else {
      const href = /^(https?:|mailto:|\/)/i.test(url) ? url : `https://${url}`;
      const { empty } = editor!.state.selection;
      if (empty) editor?.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href } }] }).run();
      else editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    linkUrl = '';
  }

  function applyImageUrl() {
    const url = imageUrl.trim();
    imageOpen = false;
    if (url) insertImage(url);
    imageUrl = '';
  }

  function applyMedia() {
    const url = mediaUrl.trim();
    mediaOpen = false;
    mediaUrl = '';
    if (!url) return;
    if (mode === 'source') wrapSource(`[media]${url}`, '[/media]', true);
    else editor?.chain().focus().insertContent({ type: 'media', attrs: { src: url } }).run();
  }

  function emoji(e: string) {
    const custom = customEmoji(e);
    if (mode === 'source') wrapSource(e, '', true);
    else if (custom) editor?.chain().focus().insertContent({ type: 'customEmoji', attrs: { code: custom.shortcode, url: custom.url, name: custom.name } }).run();
    else editor?.chain().focus().insertContent(e).run();
  }
</script>

<div
  data-part="editor"
  class={cn(
    'overflow-hidden rounded-xl border border-input bg-card transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30',
    (invalid || over) && 'border-destructive ring-3 ring-destructive/20',
    disabled && 'pointer-events-none opacity-60',
    className,
  )}
>
  <!-- Araç çubuğu -->
  <div class="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1" role="toolbar" aria-label={t('Biçimlendirme')}>
    <ToolButton label={t('Kalın (Ctrl+B)')} active={active('bold')} disabled={preview} onclick={() => run('bold')}><BoldIcon /></ToolButton>
    <ToolButton label={t('İtalik (Ctrl+I)')} active={active('italic')} disabled={preview} onclick={() => run('italic')}><ItalicIcon /></ToolButton>
    <ToolButton label={t('Altı çizili (Ctrl+U)')} active={active('underline')} disabled={preview} onclick={() => run('underline')}><UnderlineIcon /></ToolButton>
    <ToolButton label={t('Üstü çizili')} active={active('strike')} disabled={preview} onclick={() => run('strike')}><StrikethroughIcon /></ToolButton>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger disabled={preview}>
        {#snippet child({ props })}<ToolButton {...props} label={t('Başlık')} active={active('heading')}><HeadingIcon /></ToolButton>{/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="w-48">
        <DropdownMenu.Item onSelect={() => heading(0)}>{t('Normal metin')}</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => heading(2)}><span class="text-lg font-bold">{t('Başlık')}</span></DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => heading(3)}><span class="text-base font-bold">{t('Alt başlık')}</span></DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => heading(4)}><span class="text-sm font-bold">{t('Küçük başlık')}</span></DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <span class="mx-1 h-5 w-px bg-border"></span>

    <Popover.Root>
      <Popover.Trigger disabled={preview}>
        {#snippet child({ props })}<ToolButton {...props} label={t('Yazı rengi')}><PaletteIcon /></ToolButton>{/snippet}
      </Popover.Trigger>
      <Popover.Content class="w-auto p-2" align="start">
        <div class="grid grid-cols-6 gap-1.5">
          {#each COLORS as c (c)}
            <button type="button" class="size-6 rounded-md ring-1 ring-border transition-transform hover:scale-110" style="background:{c}" aria-label={c} onclick={() => color(c)}></button>
          {/each}
        </div>
        <Button variant="ghost" size="sm" class="mt-1 w-full" onclick={() => color(null)}>{t('Rengi kaldır')}</Button>
      </Popover.Content>
    </Popover.Root>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger disabled={preview}>
        {#snippet child({ props })}<ToolButton {...props} label={t('Yazı boyutu ve tipi')}><TypeIcon /></ToolButton>{/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="w-52">
        <DropdownMenu.Label>{t('Boyut')}</DropdownMenu.Label>
        {#each SIZES as s (s.v)}
          <DropdownMenu.Item onSelect={() => size(s.v)}><span style="font-size:{Math.min(parseInt(s.v), 22)}px">{t(s.label)}</span></DropdownMenu.Item>
        {/each}
        <DropdownMenu.Separator />
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger>{t('Yazı tipi')}</DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent>
            <DropdownMenu.Item onSelect={() => font(null)}>{t('Varsayılan')}</DropdownMenu.Item>
            {#each BB_FONTS as f (f)}
              <DropdownMenu.Item onSelect={() => font(f)}><span style="font-family:'{f}'">{f}</span></DropdownMenu.Item>
            {/each}
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
        {#if !compact}
          <DropdownMenu.Separator />
          <DropdownMenu.Item onSelect={() => run('sub')}><SubscriptIcon />{t('Alt simge')}</DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => run('sup')}><SuperscriptIcon />{t('Üst simge')}</DropdownMenu.Item>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <span class="mx-1 h-5 w-px bg-border"></span>

    <ToolButton label={t('Sola hizala')} active={active('paragraph', { textAlign: 'left' })} disabled={preview} onclick={() => align('left')} class="max-sm:hidden"><AlignLeftIcon /></ToolButton>
    <ToolButton label={t('Ortala')} active={active('paragraph', { textAlign: 'center' })} disabled={preview} onclick={() => align('center')}><AlignCenterIcon /></ToolButton>
    <ToolButton label={t('Sağa hizala')} active={active('paragraph', { textAlign: 'right' })} disabled={preview} onclick={() => align('right')} class="max-sm:hidden"><AlignRightIcon /></ToolButton>
    {#if !compact}
      <ToolButton label={t('İki yana yasla')} active={active('paragraph', { textAlign: 'justify' })} disabled={preview} onclick={() => align('justify')} class="max-sm:hidden"><AlignJustifyIcon /></ToolButton>
    {/if}

    <span class="mx-1 h-5 w-px bg-border"></span>

    <ToolButton label={t('Madde listesi')} active={active('bulletList')} disabled={preview} onclick={() => run('bullet')}><ListIcon /></ToolButton>
    <ToolButton label={t('Numaralı liste')} active={active('orderedList')} disabled={preview} onclick={() => run('ordered')}><ListOrderedIcon /></ToolButton>
    <ToolButton label={t('Alıntı')} active={active('blockquote')} disabled={preview} onclick={() => run('quote')}><QuoteIcon /></ToolButton>
    {#if !compact}
      <ToolButton label={t('Kod bloğu')} active={active('codeBlock')} disabled={preview} onclick={() => run('code')}><CodeIcon /></ToolButton>
      <ToolButton label={t('Spoiler (gizli içerik)')} active={active('spoiler')} disabled={preview} onclick={() => run('spoiler')}><EyeOffIcon /></ToolButton>
    {/if}

    <span class="mx-1 h-5 w-px bg-border"></span>

    <Popover.Root bind:open={linkOpen}>
      <Popover.Trigger disabled={preview}>
        {#snippet child({ props })}<ToolButton {...props} label={t('Bağlantı')} active={active('link')}><LinkIcon /></ToolButton>{/snippet}
      </Popover.Trigger>
      <Popover.Content class="w-80" align="start">
        <form
          class="flex gap-2"
          onsubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <Input bind:value={linkUrl} placeholder="https://" autofocus />
          <Button type="submit" size="sm">{t('Ekle')}</Button>
        </form>
        {#if active('link')}<Button variant="ghost" size="sm" onclick={() => ((linkUrl = ''), applyLink())}>{t('Bağlantıyı kaldır')}</Button>{/if}
      </Popover.Content>
    </Popover.Root>

    <Popover.Root bind:open={imageOpen}>
      <Popover.Trigger disabled={preview}>
        {#snippet child({ props })}<ToolButton {...props} label={t('Görsel')}>
            {#if uploading}<LoaderIcon class="animate-spin" />{:else}<ImageIcon />{/if}
          </ToolButton>{/snippet}
      </Popover.Trigger>
      <Popover.Content class="w-80" align="start">
        {#if boardId || uploadUrl}
          <Button variant="outline" class="w-full" onclick={() => fileInput?.click()}><UploadIcon />{t('Bilgisayardan yükle')}</Button>
          <p class="text-center text-xs text-muted-foreground">{t('ya da görseli editöre sürükleyin / yapıştırın')}</p>
        {/if}
        <form
          class="flex gap-2"
          onsubmit={(e) => {
            e.preventDefault();
            applyImageUrl();
          }}
        >
          <Input bind:value={imageUrl} placeholder={t('Görsel adresi (https://…)')} />
          <Button type="submit" size="sm">{t('Ekle')}</Button>
        </form>
      </Popover.Content>
    </Popover.Root>

    {#if !compact && embedsOn}
      <Popover.Root bind:open={mediaOpen}>
        <Popover.Trigger disabled={preview}>
          {#snippet child({ props })}<ToolButton {...props} label={t('Gömülü içerik (YouTube, Spotify, X, Instagram, TikTok…)')}><VideoIcon /></ToolButton>{/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-80" align="start">
          <form
            class="flex gap-2"
            onsubmit={(e) => {
              e.preventDefault();
              applyMedia();
            }}
          >
            <Input bind:value={mediaUrl} placeholder={t('YouTube, Spotify, X, Instagram, TikTok… bağlantısı')} />
            <Button type="submit" size="sm">{t('Ekle')}</Button>
          </form>
        </Popover.Content>
      </Popover.Root>
      <ToolButton label={t('Tablo')} disabled={preview} onclick={() => run('table')} class="max-sm:hidden"><TableIcon /></ToolButton>
      <ToolButton label={t('Yatay çizgi')} disabled={preview} onclick={() => run('hr')} class="max-sm:hidden"><MinusIcon /></ToolButton>
    {/if}

    <Popover.Root>
      <Popover.Trigger disabled={preview}>
        {#snippet child({ props })}<ToolButton {...props} label={t('İfade')}><SmileIcon /></ToolButton>{/snippet}
      </Popover.Trigger>
      <Popover.Content class="w-auto p-2.5" align="start">
        <EmojiPicker onpick={emoji} />
      </Popover.Content>
    </Popover.Root>

    <div class="ml-auto flex items-center gap-0.5">
      {#if mode === 'visual'}
        <ToolButton label={t('Geri al (Ctrl+Z)')} disabled={preview} onclick={() => run('undo')} class="max-sm:hidden"><UndoIcon /></ToolButton>
        <ToolButton label={t('Yinele (Ctrl+Y)')} disabled={preview} onclick={() => run('redo')} class="max-sm:hidden"><RedoIcon /></ToolButton>
      {/if}
      <ToolButton label={mode === 'visual' ? t('BBCode kaynağını göster') : t('Görsel editöre dön')} active={mode === 'source'} disabled={preview} onclick={() => setMode(mode === 'visual' ? 'source' : 'visual')}>
        {#if mode === 'visual'}<BracesIcon />{:else}<PenLineIcon />{/if}
      </ToolButton>
      <ToolButton label={preview ? t('Düzenlemeye dön') : t('Önizleme')} active={preview} onclick={togglePreview}><EyeIcon /></ToolButton>
    </div>
  </div>

  <!-- İçerik -->
  <div class="relative" style="min-height:{minHeight}px">
    <div
      bind:this={host}
      class={cn('bb-editor h-full px-3.5 py-3', (mode !== 'visual' || preview) && 'hidden')}
      style="min-height:{minHeight}px"
    ></div>
    {#if mode === 'visual' && !editor && !preview}
      <!-- Editör yüklenene kadar (ve SSR'da) içerik düz metin olarak görünür -->
      <div class="absolute inset-0 px-3.5 py-3 text-sm whitespace-pre-wrap text-muted-foreground">{value || placeholder}</div>
    {/if}
    {#if mode === 'source' && !preview}
      <textarea
        bind:this={textarea}
        {id}
        value={value ?? ''}
        oninput={(e) => emit(e.currentTarget.value)}
        onkeydown={onSourceKey}
        onpaste={(e) => {
          const files = [...(e.clipboardData?.files ?? [])];
          if (files.some((f) => f.type.startsWith('image/'))) {
            e.preventDefault();
            void uploadFiles(files);
          }
        }}
        {placeholder}
        spellcheck="true"
        class="block w-full resize-y bg-transparent px-3.5 py-3 font-mono text-[13px] leading-relaxed outline-none"
        style="min-height:{minHeight}px"
      ></textarea>
    {/if}
    {#if preview}
      <div class="px-3.5 py-3" style="min-height:{minHeight}px">
        {#if previewLoading}
          <div class="flex items-center gap-2 text-sm text-muted-foreground"><LoaderIcon class="size-4 animate-spin" />{t('Önizleme hazırlanıyor…')}</div>
        {:else}
          <div class="prose-forum animate-in duration-200 fade-in-0">{@html previewHtml}</div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Alt şerit yalnızca gerektiğinde: görsel yüklenirken, kaynak modunda ya da sınıra yaklaşınca -->
  {#if uploading || mode === 'source' || (maxLength && length > maxLength * 0.8)}
    <div class="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
      <span>{#if uploading}{t('Görsel yükleniyor…')}{:else if mode === 'source'}{t('BBCode kaynağı düzenleniyor')}{/if}</span>
      {#if maxLength && length > maxLength * 0.8}<span class={cn('tabular-nums', over && 'font-medium text-destructive')}>{length.toLocaleString(localeTag())} / {maxLength.toLocaleString(localeTag())}</span>{/if}
    </div>
  {/if}
</div>

<input
  bind:this={fileInput}
  type="file"
  accept="image/png,image/jpeg,image/webp,image/gif"
  multiple
  class="hidden"
  onchange={(e) => {
    const files = [...(e.currentTarget.files ?? [])];
    e.currentTarget.value = '';
    imageOpen = false;
    void uploadFiles(files);
  }}
/>
