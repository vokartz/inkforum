import { Node, mergeAttributes, type AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Blockquote from '@tiptap/extension-blockquote';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Image from '@tiptap/extension-image';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import Mention from '@tiptap/extension-mention';
import { Placeholder } from '@tiptap/extensions';
import { EMBED_PROVIDERS, resolveEmbed } from '@forum/shared';
import { t } from '$lib/i18n.svelte';
import { mentionSuggestion } from './mention';

/** Alıntı: yazar ve mesaj bilgisini taşır ([quote author=… post=…]). */
const Quote = Blockquote.extend({
  addAttributes() {
    return {
      author: { default: null, parseHTML: (el) => el.getAttribute('data-author'), renderHTML: (a) => (a.author ? { 'data-author': a.author } : {}) },
      post: { default: null, parseHTML: (el) => Number(el.getAttribute('data-post')) || null, renderHTML: (a) => (a.post ? { 'data-post': a.post } : {}) },
      date: { default: null, parseHTML: (el) => Number(el.getAttribute('data-date')) || null, renderHTML: (a) => (a.date ? { 'data-date': a.date } : {}) },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes, { class: 'bb-quote' }), 0];
  },
});

/** [spoiler=Başlık] — editörde açık bir kutu olarak gösterilir. */
export const Spoiler = Node.create({
  name: 'spoiler',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return { title: { default: null, parseHTML: (el) => el.getAttribute('data-title'), renderHTML: (a) => ({ 'data-title': a.title || 'Spoiler' }) } };
  },
  parseHTML() {
    return [{ tag: 'div[data-spoiler]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-spoiler': '', class: 'bb-spoiler-edit' }), 0];
  },
});

/** [media]adres[/media] — editörde video kartı. */
export const Media = Node.create({
  name: 'media',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { src: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'div[data-media]', getAttrs: (el) => ({ src: (el as HTMLElement).getAttribute('data-src') ?? '' }) }];
  },
  renderHTML({ node }) {
    const embed = resolveEmbed(node.attrs.src, { host: typeof location === 'undefined' ? 'localhost' : location.hostname });
    const color = EMBED_PROVIDERS.find((p) => p.key === embed?.provider)?.color ?? 'var(--primary)';
    const label = embed ? t('{name} içeriği', { name: embed.name }) : t('Desteklenmeyen bağlantı');
    return [
      'div',
      { 'data-media': '', 'data-src': node.attrs.src, class: 'bb-media-edit', style: `--embed-color:${color}` },
      ['span', { class: 'bb-media-edit-label' }, label],
      ['span', { class: 'bb-media-edit-src' }, node.attrs.src],
    ];
  },
});

export function buildExtensions(opts: { placeholder: string; mentions: boolean }): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4], HTMLAttributes: { class: 'bb-h' } },
      blockquote: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'nofollow noopener', target: null } },
      codeBlock: { HTMLAttributes: { class: 'bb-code' } },
    }),
    Quote,
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ['paragraph'] }),
    Subscript,
    Superscript,
    Image.configure({ inline: true, allowBase64: false, HTMLAttributes: { class: 'bb-img' } }),
    Table.configure({ resizable: false, HTMLAttributes: { class: 'bb-table' } }),
    TableRow,
    TableHeader,
    TableCell,
    Spoiler,
    Media,
    ...(opts.mentions
      ? [
          Mention.configure({
            HTMLAttributes: { class: 'bb-mention' },
            renderText: ({ node }) => `@${node.attrs.label}`,
            renderHTML: ({ node, options }) => ['span', mergeAttributes({ 'data-type': 'mention' }, options.HTMLAttributes), `@${node.attrs.label}`],
            suggestion: mentionSuggestion(),
          }),
        ]
      : []),
    Placeholder.configure({ placeholder: opts.placeholder }),
  ];
}
