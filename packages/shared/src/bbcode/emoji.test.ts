import { describe, expect, it } from 'vitest';
import { emojiCode, renderBBCode } from '../index.js';

describe('emoji', () => {
  it('maps emoji to twemoji file names', () => {
    expect(emojiCode('😀')).toBe('1f600');
    expect(emojiCode('❤️')).toBe('2764');
    expect(emojiCode('👨‍💻')).toBe('1f468-200d-1f4bb');
    expect(emojiCode('🇹🇷')).toBe('1f1f9-1f1f7');
    expect(emojiCode('👍🏽')).toBe('1f44d-1f3fd');
  });

  it('renders known emoji as images and leaves text symbols alone', () => {
    const has = (c: string) => ['1f600', '2764', '1f1f9-1f1f7', '31-20e3'].includes(c);
    const { html } = renderBBCode('Selam 😀 ❤️ 🇹🇷 1️⃣ © 2026 🦄', { emoji: { has } });
    expect(html).toContain('<img class="bb-emoji" src="/emoji/1f600.svg" alt="😀"');
    expect(html).toContain('/emoji/2764.svg');
    expect(html).toContain('/emoji/1f1f9-1f1f7.svg');
    expect(html).toContain('/emoji/31-20e3.svg');
    expect(html).toContain('© 2026');
    expect(html).toContain('🦄'); // görseli olmayan emoji metin kalır
    expect(renderBBCode('[url=https://a.com]😀[/url]', { emoji: { has } }).html).toContain('bb-emoji');
  });
});
