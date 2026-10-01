import { describe, expect, it } from 'vitest';
import { bbcodeExcerpt, bbcodeToDoc, bbcodeToText, docToBBCode, extractHeadings, parseBBCode, renderBBCode } from './index.js';

const html = (s: string) => renderBBCode(s).html;

describe('parseBBCode', () => {
  it('builds a tree and keeps unknown tags as text', () => {
    const nodes = parseBBCode('a [b]kalın [i]x[/i][/b] [foo]y[/foo]');
    expect(nodes).toHaveLength(3);
    expect(nodes[1]).toMatchObject({ type: 'tag', name: 'b' });
    expect(nodes[2]).toEqual({ type: 'text', text: ' [foo]y[/foo]' });
  });

  it('repairs mis-nested tags', () => {
    expect(html('[b]a[i]b[/b]c[/i]')).toBe('<strong>a<em>b</em></strong>c[/i]');
    expect(html('[b]kapanmadı')).toBe('<strong>kapanmadı</strong>');
  });

  it('parses quote attributes with spaces (SMF style)', () => {
    const [q] = parseBBCode('[quote author=Ali Veli post=12 date=1700000000]x[/quote]');
    expect(q).toMatchObject({ name: 'quote', attrs: { author: 'Ali Veli', post: '12', date: '1700000000' } });
    const [q2] = parseBBCode('[quote="Ayşe Yılmaz" post=3]x[/quote]');
    expect(q2).toMatchObject({ value: 'Ayşe Yılmaz', attrs: { post: '3' } });
  });

  it('keeps raw content of code blocks', () => {
    expect(html('[code]a [b]b[/b] <c>[/code]')).toBe('<pre class="bb-code"><code>a [b]b[/b] &lt;c&gt;</code></pre>');
  });

  it('auto-closes list items and ignores [*] outside lists', () => {
    expect(html('[list]\n[*]bir\n[*]iki\n[/list]')).toBe('<ul class="bb-list"><li>bir</li><li>iki</li></ul>');
    expect(html('[*]yalnız')).toBe('[*]yalnız');
  });

  it('swallows single newlines around blocks', () => {
    expect(html('a\n[quote]\nx\n[/quote]\nb')).toBe(
      'a<blockquote class="bb-quote"><div class="bb-quote-body">x</div></blockquote>b',
    );
    expect(html('a\n\nb')).toBe('a<br><br>b');
  });
});

describe('renderBBCode security', () => {
  it('escapes html', () => {
    expect(html('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('rejects dangerous urls', () => {
    expect(html('[url=javascript:alert(1)]x[/url]')).toBe('x');
    expect(html('[url]javascript:alert(1)[/url]')).toBe('javascript:alert(1)');
    expect(html('[img]javascript:alert(1)[/img]')).not.toContain('<img');
    expect(html('[img]https://x.com/a.png" onerror="alert(1)[/img]')).not.toContain('<img');
    expect(html('[url=https://x.com/"onmouseover=alert(1)]x[/url]')).toBe('x');
  });

  it('rejects style injection', () => {
    expect(html('[color=red;background:url(x)]a[/color]')).toBe('a');
    expect(html('[size=999]a[/size]')).toBe('a');
    expect(html('[font=x;}body{display:none]a[/font]')).toBe('a');
  });

  it('adds nofollow to external links and linkifies bare urls', () => {
    expect(html('bak: https://ornek.com/a?b=1.')).toBe(
      'bak: <a href="https://ornek.com/a?b=1" rel="nofollow ugc noopener noreferrer" target="_blank">https://ornek.com/a?b=1</a>.',
    );
  });

  it('does not nest links', () => {
    expect(html('[url=https://a.com]https://b.com[/url]')).toBe(
      '<a href="https://a.com" rel="nofollow ugc noopener noreferrer" target="_blank">https://b.com</a>',
    );
  });

  it('embeds only known video providers', () => {
    expect(html('[media]https://www.youtube.com/watch?v=dQw4w9WgXcQ[/media]')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(html('[media]https://evil.com/x[/media]')).not.toContain('iframe');
  });

  it('collects mentions and quoted posts', () => {
    const r = renderBBCode('[quote author=A post=5]x[/quote] [mention=7]Ali[/mention]');
    expect(r.mentions).toEqual([7]);
    expect(r.quotedPosts).toEqual([5]);
  });

  it('limits quote depth', () => {
    const deep = '[quote]'.repeat(5) + 'x' + '[/quote]'.repeat(5);
    expect(renderBBCode(deep, { maxQuoteDepth: 2 }).html).toContain('[…]');
  });
});

describe('bbcodeToText', () => {
  it('produces readable plain text', () => {
    expect(bbcodeToText('[quote]eski[/quote]Merhaba [b]dünya[/b] [img]https://x.com/a.png[/img]')).toBe('Merhaba dünya [görsel]');
    expect(bbcodeExcerpt('a '.repeat(200), 20).length).toBeLessThanOrEqual(21);
  });
});

describe('tiptap bridge', () => {
  const cases = [
    'Düz metin',
    'Satır 1\nSatır 2\n\nSatır 4',
    '[b]kalın [i]ve italik[/i][/b] normal',
    '[color=#ff0000]kırmızı[/color] [size=5]büyük[/size] [font=Georgia]yazı[/font]',
    '[url=https://ornek.com]bağlantı[/url]',
    '[center]ortalı\nikinci[/center]\nsol',
    '[quote author="Ali Veli" post=12]\nalıntı\n[/quote]\ncevap',
    '[code=js]const a = [1];\n  b()[/code]',
    '[list]\n[*]bir\n[*]iki\n[/list]',
    '[list=1]\n[*]bir\n[/list]',
    '[spoiler="Gizli Bölüm"]\nsürpriz\n[/spoiler]',
    '[table]\n[tr][th]A[/th][td]B[/td][/tr]\n[/table]',
    'resim: [img width=100]https://x.com/a.png[/img]',
    '[mention=3]Ayşe[/mention] selam',
    '[media]https://youtu.be/dQw4w9WgXcQ[/media]',
    '[hr]',
    'kod: [icode]x[/icode]',
  ];

  it.each(cases)('round-trips %j', (src) => {
    const once = docToBBCode(bbcodeToDoc(src));
    expect(once).toBe(src);
    expect(docToBBCode(bbcodeToDoc(once))).toBe(once);
  });

  it('turns known custom emoji shortcodes into nodes and back', () => {
    const find = (c: string) => (c === 'pepe' ? { url: '/u/pepe.png', name: 'Pepe' } : undefined);
    const src = 'selam :pepe: [b]ve :pepe:[/b] :yok: [icode]:pepe:[/icode]';
    const doc = bbcodeToDoc(src, { customEmoji: find });
    const inline = doc.content![0]!.content!;
    expect(inline.filter((n) => n.type === 'customEmoji')).toHaveLength(2);
    expect(inline.find((n) => n.type === 'customEmoji' && n.marks)?.marks?.[0]?.type).toBe('bold');
    expect(docToBBCode(doc)).toBe(src);
  });

  it('escapes tag-like text typed in the visual editor', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'yaz [b] böyle' }] }] };
    const bb = docToBBCode(doc);
    expect(bb).toBe('yaz [noparse][b][/noparse] böyle');
    expect(html(bb)).toBe('yaz [b] böyle');
  });

  it('merges adjacent marks without redundant tags', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'b', marks: [{ type: 'bold' }, { type: 'italic' }] },
            { type: 'text', text: 'c' },
          ],
        },
      ],
    };
    expect(docToBBCode(doc)).toBe('[b]a[i]b[/i][/b]c');
  });
});

describe('headings', () => {
  it('renders anchored headings and extracts a table of contents', () => {
    const out = html('[h2]Kurulum Şartları[/h2]\nmetin\n[h3]Adım 1[/h3]\n[h2]Kurulum Şartları[/h2]');
    expect(out).toContain('<h2 class="bb-h" id="kurulum-sartlari">Kurulum Şartları</h2>');
    expect(out).toContain('id="kurulum-sartlari-2"');
    expect(extractHeadings(out)).toEqual([
      { id: 'kurulum-sartlari', text: 'Kurulum Şartları', level: 2 },
      { id: 'adim-1', text: 'Adım 1', level: 3 },
      { id: 'kurulum-sartlari-2', text: 'Kurulum Şartları', level: 2 },
    ]);
  });

  it('round-trips headings through the editor document', () => {
    const bb = '[h2]Başlık [b]kalın[/b][/h2]\nparagraf';
    const doc = bbcodeToDoc(bb);
    expect(doc.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    expect(docToBBCode(doc)).toBe(bb);
  });
});
