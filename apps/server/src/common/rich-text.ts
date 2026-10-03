import { renderBBCode } from '@forum/shared';
import { emojiOptions } from './emoji.js';

export function renderRichText(text: string, opts: { images?: boolean } = {}): string {
  return renderBBCode(text ?? '', { media: false, images: opts.images ?? true, maxQuoteDepth: 2, emoji: emojiOptions }).html;
}
