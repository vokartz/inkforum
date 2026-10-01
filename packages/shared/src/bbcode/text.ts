import { parseBBCode, rawContent, type BBNode } from './parser.js';
import { isBlockTag } from './tags.js';

/**
 * BBCode → düz metin (bildirim önizlemesi, widget özeti, arama dizini).
 * Alıntılar ve spoiler içerikleri atlanır; görsel/video yer tutucuya dönüşür.
 */
export function bbcodeToText(input: string, opts: { quotes?: boolean } = {}): string {
  const out: string[] = [];
  const walk = (nodes: BBNode[]) => {
    for (const n of nodes) {
      if (n.type === 'text') {
        out.push(n.text);
        continue;
      }
      switch (n.name) {
        case 'quote':
          if (opts.quotes) walk(n.children);
          else out.push(' ');
          break;
        case 'spoiler':
          out.push(' [spoiler] ');
          break;
        case 'img':
          out.push(' [görsel] ');
          break;
        case 'media':
        case 'youtube':
        case 'embed':
          out.push(' [medya] ');
          break;
        case 'mention':
          out.push('@' + rawContent(n).trim().replace(/^@/, ''));
          break;
        case 'code':
        case 'icode':
        case 'noparse':
          out.push(rawContent(n));
          break;
        case 'hr':
          out.push('\n');
          break;
        default:
          if (isBlockTag(n.name)) out.push('\n');
          walk(n.children);
          if (isBlockTag(n.name)) out.push('\n');
      }
    }
  };
  walk(parseBBCode(input));
  return out
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** Tek satırlık kısa özet. */
export function bbcodeExcerpt(input: string, max = 200): string {
  const text = bbcodeToText(input).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…';
}
