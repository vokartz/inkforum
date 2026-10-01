import { describe, expect, it } from 'vitest';
import { DEFAULT_OG_CARD, ogCardSchema } from '@forum/shared';
import { renderCardSvg } from './og-card.js';

const content = { kicker: 'Duyurular', title: 'Yeni sürüm <yayında> & hazır', meta: 'Ali · 3 yanıt', forum: 'Forum' };

describe('share card svg', () => {
  it('escapes text and draws every layout', () => {
    for (const layout of ['classic', 'centered', 'split', 'minimal'] as const) {
      const svg = renderCardSvg(content, { ...DEFAULT_OG_CARD, layout }, '#7b61ff', { logo: null, background: null });
      expect(svg).toContain('&lt;yayında&gt;');
      expect(svg).toContain('&amp;');
      expect(svg).not.toContain('<yayında>');
    }
  });

  it('uses dark text on light backgrounds and hides optional parts', () => {
    const card = ogCardSchema.parse({ background: { kind: 'light' }, kicker: false, meta: false, pattern: 'dots', font: 'serif' });
    const svg = renderCardSvg(content, card, '#7b61ff', { logo: null, background: null });
    expect(svg).toContain('fill="#111318"');
    expect(svg).not.toContain('Duyurular');
    expect(svg).not.toContain('3 yanıt');
    expect(svg).toContain('DejaVu Serif');
    expect(svg).toContain('id="pt"');
  });

  it('embeds the background image with the chosen dim', () => {
    const card = ogCardSchema.parse({ background: { kind: 'image', image: '/uploads/a.png', dim: 40 } });
    const svg = renderCardSvg(content, card, '#7b61ff', { logo: 'data:image/png;base64,AAA', background: 'data:image/png;base64,BBB' });
    expect(svg).toContain('href="data:image/png;base64,BBB"');
    expect(svg).toContain('fill-opacity="0.40"');
    expect(svg).toContain('href="data:image/png;base64,AAA"');
  });
});
