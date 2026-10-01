import { describe, expect, it } from 'vitest';
import { ipsToBBCode, mybbToBBCode, phpbbToBBCode, smfToBBCode } from './convert.js';
import { fixDoubleEncoding } from './text.js';
import { parseInsert } from './sql-dump.js';

const P = (id: number | string) => `\u0001p:${id}\u0002`;
const U = (id: number | string) => `\u0001u:${id}\u0002`;
const A = (id: number | string) => `\u0001a:${id}\u0002`;

describe('importer body converters', () => {
  it('converts SMF bodies', () => {
    const body =
      '[quote author=Ali Veli link=topic=1.msg12#msg12 date=1600000000]Alıntı &quot;metin&quot;[/quote]<br />Yanıt&nbsp; [member=5]Ayşe[/member]<br />[list type=decimal][li]bir[/li][li]iki[/li][/list][code]&lt;b&gt;[b]x[/b]&lt;/b&gt;[/code][attach id=9]a.png[/attach][red]kırmızı[/red][size=10pt]k[/size]';
    const out = smfToBBCode(body);
    expect(out).toContain(`[quote author="Ali Veli" post=${P(12)}]Alıntı "metin"[/quote]`);
    expect(out).toContain(`Yanıt  [mention=${U(5)}]Ayşe[/mention]`);
    expect(out).toContain('[list=1][*]bir[*]iki[/list]');
    expect(out).toContain('[code]<b>[b]x[/b]</b>[/code]');
    expect(out).toContain(A(9));
    expect(out).not.toContain('a.png');
    expect(out).toContain('[color=red]kırmızı[/color]');
    expect(out).toContain('[size=10pt]k[/size]');
  });

  it('converts phpBB 3.2+ s9e XML and legacy text', () => {
    expect(phpbbToBBCode('<r><B><s>[b]</s>Kalın<e>[/b]</e></B> &amp; <E>:)</E><br/>\nsatır</r>', '')).toBe('[b]Kalın[/b] & :)\nsatır');
    const legacy =
      '[quote=&quot;Zeynep&quot;:abc12345]Alıntı[/quote:abc12345]Yanıt [size=150:abc12345]büyük[/size:abc12345] [attachment=0:abc12345]<!-- ia0 -->dosya.zip<!-- ia0 -->[/attachment:abc12345] <!-- s:) --><img src="{SMILIES_PATH}/icon_e_smile.gif" alt=":)" title="Smile" /><!-- s:) -->';
    const out = phpbbToBBCode(legacy, 'abc12345', (i) => (i === 0 ? '77' : null));
    expect(out).toContain('[quote author="Zeynep"]Alıntı[/quote]');
    expect(out).toContain('[size=5]büyük[/size]');
    expect(out).toContain(A(77));
    expect(out).toContain(':)');
    expect(phpbbToBBCode('<r><QUOTE author="Can" post_id="44" time="1" user_id="3"><s>[quote="Can" post_id=44 time=1 user_id=3]</s>x<e>[/quote]</e></QUOTE></r>', '')).toBe(
      `[quote author="Can" post=${P(44)}]x[/quote]`,
    );
  });

  it('converts MyBB MyCode', () => {
    const out = mybbToBBCode("[quote='Kaan' pid='3' dateline='1600000000']ilk[/quote]\n[align=center]orta[/align] [size=large]b[/size] [attachment=12] [video=youtube]https://youtu.be/dQw4w9WgXcQ[/video]");
    expect(out).toContain(`[quote author="Kaan" post=${P(3)}]ilk[/quote]`);
    expect(out).toContain('[center]orta[/center]');
    expect(out).toContain('[size=5]b[/size]');
    expect(out).toContain(A(12));
    expect(out).toContain('[media]https://youtu.be/dQw4w9WgXcQ[/media]');
  });

  it('converts IPS HTML', () => {
    const html = `<p>Merhaba <strong>IPS</strong> &amp; <span style="color:#ff0000;">renk</span></p>
<blockquote class="ipsQuote" data-ipsquote-username="Deniz" data-ipsquote-contentcommentid="15"><div class="ipsQuote_citation">Deniz said:</div><div class="ipsQuote_contents"><p>alıntı</p></div></blockquote>
<p><a href="<___base_url___>/topic/1-x/" rel="">bağlantı</a> <a data-mentionid="8" href="#">@Ece</a> <img alt=":)" data-emoticon="" src="<fileStore.core_Emoticons>/emoticons/smile.png"></p>
<ul><li>bir</li><li>iki</li></ul><pre class="ipsCode">if (a &lt; b) {}</pre>
<p><a class="ipsAttachLink ipsAttachLink_image" href="<fileStore.core_Attachment>/monthly_2020_01/a.jpg.abc.jpg" data-fileid="31"><img src="<fileStore.core_Attachment>/monthly_2020_01/a.thumb.jpg.abc.jpg"></a></p>
<div class="ipsSpoiler"><div class="ipsSpoiler_header"><span>Spoiler</span></div><div class="ipsSpoiler_contents"><p>gizli</p></div></div>
<iframe data-embed-src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?feature=oembed"></iframe>`;
    const out = ipsToBBCode(html, { baseUrl: 'https://eski.ips.test', attachment: ({ id }) => (id === '31' ? '31' : null) });
    expect(out).toContain('Merhaba [b]IPS[/b] & [color=#ff0000]renk[/color]');
    expect(out).toContain(`[quote author="Deniz" post=${P(15)}]alıntı[/quote]`);
    expect(out).not.toContain('said:');
    expect(out).toContain('[url=https://eski.ips.test/topic/1-x/]bağlantı[/url]');
    expect(out).toContain(`[mention=${U(8)}]Ece[/mention]`);
    expect(out).toContain(' :)');
    expect(out).toContain('[list]\n[*]bir\n[*]iki\n[/list]');
    expect(out).toContain('[code]if (a < b) {}[/code]');
    expect(out).toContain(A(31));
    expect(out).toContain('[spoiler]gizli[/spoiler]');
    expect(out).toContain('[media]https://www.youtube.com/watch?v=dQw4w9WgXcQ[/media]');
  });

  it('fixes double-encoded Turkish text', () => {
    const broken = Buffer.from('Şükrü ığdır çiçek “alıntı”', 'utf8').toString('latin1');
    expect(fixDoubleEncoding(broken.replace(/[\u0080-\u009f]/g, (c) => c))).toBe('Şükrü ığdır çiçek “alıntı”');
    expect(fixDoubleEncoding('normal metin')).toBe('normal metin');
  });

  it('parses mysqldump and phpMyAdmin insert syntax', () => {
    const ins = parseInsert("INSERT INTO `t` (`a`, `b`, `c`) VALUES (1,'it\\'s \\\\ ok',NULL),(0x414243,'x''y',_utf8mb4'z')");
    expect(ins?.columns).toEqual(['a', 'b', 'c']);
    expect(ins?.rows[0]).toEqual([1, "it's \\ ok", null]);
    expect(ins?.rows[1]).toEqual(['ABC', "x'y", 'z']);
  });
});
