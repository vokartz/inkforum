import { Injectable } from '@nestjs/common';
import { builderDocSchema, type BuilderDoc, type ResolvedBlock } from '@forum/shared';
import { Errors } from '../common/errors.js';
import { iconNode } from '../common/icons.js';
import { PostRenderService } from '../forum/post-render.service.js';
import { ForumService } from '../forum/forum.service.js';
import { GroupsService } from '../groups/groups.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { RequestViewer } from '../common/request-context.js';

/** Sürükle-bırak sayfaların doğrulanması ve ziyaretçi için çözümlenmesi. */
@Injectable()
export class BuilderService {
  constructor(
    private readonly render: PostRenderService,
    private readonly forum: ForumService,
    private readonly groups: GroupsService,
    private readonly settings: SettingsService,
  ) {}

  /** Kaydetmeden önce: JSON + şema doğrulaması. HTML blokları "Özel kod" yetkisi ister. */
  parse(body: string, canCode: boolean, prevHadHtml: boolean): BuilderDoc {
    let json: unknown;
    try {
      json = JSON.parse(body || '{"blocks":[]}');
    } catch {
      throw Errors.field('body', 'Sayfa verisi okunamadı.');
    }
    const res = builderDocSchema.safeParse(json);
    if (!res.success) {
      const issue = res.error.issues[0]!;
      const idx = issue.path[1];
      throw Errors.field('body', `${typeof idx === 'number' ? `${idx + 1}. blok: ` : ''}${issue.message}`);
    }
    const hasCode = res.data.blocks.some((b) => b.type === 'html' && b.html.trim()) || !!res.data.css.trim();
    if ((hasCode || prevHadHtml) && !canCode) throw Errors.forbidden('Özel HTML blokları ve sayfa CSS kodu için "Özel kod" yetkisi gerekir.');
    return res.data;
  }

  static hasHtml(body: string): boolean {
    try {
      const doc = JSON.parse(body) as { blocks?: Array<{ type?: string; html?: string }>; css?: string };
      return !!doc.blocks?.some((b) => b.type === 'html' && !!b.html?.trim()) || !!doc.css?.trim();
    } catch {
      return false;
    }
  }

  /** Sayfa CSS'i (özel kod kapalıyken boş); `</style` kaçışı engellenir */
  css(body: string): string {
    if (!this.settings.get('custom.enabled')) return '';
    try {
      const css = String((JSON.parse(body) as { css?: unknown }).css ?? '');
      return css.replace(/<\/?(style|script)/gi, '');
    } catch {
      return '';
    }
  }

  /** Ziyaretçiye göre: görünürlük, metinlerin HTML'i ve dinamik veriler. */
  async resolve(viewer: RequestViewer, body: string): Promise<ResolvedBlock[]> {
    let doc: BuilderDoc;
    try {
      doc = builderDocSchema.parse(JSON.parse(body || '{"blocks":[]}'));
    } catch {
      return [];
    }
    const customOn = this.settings.get('custom.enabled');
    const blocks = doc.blocks.filter(
      (b) => (b.visibility === 'all' || (b.visibility === 'members') === !!viewer.user) && (b.type !== 'html' || customOn),
    );

    // Dinamik veriler tek sefer alınır
    const needIndex = blocks.some((b) => b.type === 'stats' || b.type === 'boards');
    const latestLimit = Math.max(0, ...blocks.map((b) => (b.type === 'latest' ? b.limit : 0)));
    const [index, latest] = await Promise.all([
      needIndex ? this.forum.index(viewer) : null,
      latestLimit ? this.forum.recent(viewer, latestLimit) : [],
    ]);

    const out: ResolvedBlock[] = [];
    for (const b of blocks) {
      switch (b.type) {
        case 'text':
        case 'split':
          out.push({ ...b, html: this.render.post(b.body).html });
          break;
        case 'features':
          out.push({ ...b, itemIcons: b.items.map((i) => (i.icon ? iconNode(i.icon) : null)) });
          break;
        case 'faq':
          out.push({ ...b, faqHtml: b.items.map((i) => this.render.post(i.a).html) });
          break;
        case 'video':
          out.push({ ...b, html: b.url ? this.render.post(`[media]${b.url.replace(/[[\]\n]/g, '')}[/media]`).html : '' });
          break;
        case 'stats':
          out.push({ ...b, stats: index ? { ...index.stats, online: index.online?.total ?? 0 } : undefined, onlineSummary: index?.online ? { total: index.online.total, guests: index.online.guests } : null });
          break;
        case 'latest':
          out.push({ ...b, topics: latest.slice(0, b.limit) });
          break;
        case 'boards':
          out.push({
            ...b,
            categories: (index?.categories ?? []).map((c) => ({
              id: c.id,
              name: c.name,
              boards: c.boards.map((x) => ({ id: x.id, name: x.name, slug: x.slug, description: x.description, topicCount: x.topicCount, postCount: x.postCount })),
            })),
          });
          break;
        case 'team': {
          if (!b.groupId) {
            out.push({ ...b, members: [], group: null });
            break;
          }
          try {
            const g = await this.groups.require(b.groupId);
            const list = await this.groups.members(b.groupId, 1, b.limit);
            out.push({ ...b, members: list.items.map((i) => i.user), group: { name: g.name, color: g.color } });
          } catch {
            out.push({ ...b, members: [], group: null });
          }
          break;
        }
        default:
          out.push(b);
      }
    }
    return out;
  }
}
