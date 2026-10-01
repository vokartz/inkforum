import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { plainExcerpt, pluginEnabled, type TopicEmbed } from '@forum/shared';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Db } from '../database/db.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { ViewerService } from '../auth/viewer.service.js';
import { ForumAccessService } from '../forum/forum-access.service.js';
import { UsersService } from '../users/users.service.js';
import { WikiService } from '../wiki/wiki.service.js';
import { PoliciesService } from '../policies/policies.service.js';
import { StorageService } from '../storage/storage.service.js';
import { can, type RequestViewer } from '../common/request-context.js';

export interface SitemapUrl {
  loc: string;
  lastmod: number | null;
  priority?: number;
}

const TOPICS_PER_SITEMAP = 10_000;

/** Robots ve site haritasında hiç dizinlenmeyecek yollar */
const PRIVATE_PATHS = [
  '/admin',
  '/api/',
  '/studio',
  '/install',
  '/settings',
  '/messages',
  '/notifications',
  '/search',
  '/unread',
  '/new',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/confirm-email',
  '/change-password',
  '/oauth/',
  '/go/',
  '/embed/',
  '/tickets',
  '/applications/view',
  '/applications/review',
  '/wiki/new',
  '/wiki/edit',
  '/wiki/history',
];

const AI_CRAWLERS = ['GPTBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai', 'CCBot', 'Google-Extended', 'PerplexityBot', 'Bytespider', 'Amazonbot', 'Applebot-Extended', 'Meta-ExternalAgent', 'cohere-ai'];

/** Arama motoru dosyaları (robots, site haritası), oEmbed ve paylaşım görselleri. */
@Injectable()
export class SeoService {
  private readonly logger = new Logger('SEO');
  private guestViewer: RequestViewer | null = null;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly viewers: ViewerService,
    private readonly access: ForumAccessService,
    private readonly users: UsersService,
    private readonly wiki: WikiService,
    private readonly policies: PoliciesService,
    private readonly storage: StorageService,
  ) {}

  private url(path: string): string {
    return `${this.config.appUrl}${path}`;
  }

  private async guest(): Promise<RequestViewer> {
    // Yetkiler önbellekten gelir; misafir bağlamı her çağrıda ucuzdur ama tekrar kurmaya gerek yok
    this.guestViewer = await this.viewers.forUser(null, null, null, null);
    return this.guestViewer;
  }

  /** Uygulama bildirimi (manifest) ve simge yönlendirmeleri için marka özeti */
  brand() {
    const favicon = this.settings.get('appearance.faviconUrl');
    return {
      name: String(this.settings.get('general.forumName')),
      description: String(this.settings.get('general.forumDescription') ?? ''),
      icon: favicon ? String(favicon) : null,
      accent: String(this.settings.get('appearance.accentColor') ?? '#7b61ff'),
      mode: String(this.settings.get('appearance.defaultMode') ?? 'dark'),
      lang: String(this.settings.get('i18n.defaultLocale') ?? 'tr'),
    };
  }

  // ---------- robots.txt ----------

  robots(): string {
    const lines: string[] = [];
    if (!this.settings.get('seo.indexing')) {
      lines.push('# Dizinleme yönetim panelinden kapatıldı', 'User-agent: *', 'Disallow: /');
      return `${lines.join('\n')}\n`;
    }
    if (this.settings.get('seo.blockAiCrawlers')) {
      for (const bot of AI_CRAWLERS) lines.push(`User-agent: ${bot}`);
      lines.push('Disallow: /', '');
    }
    lines.push('User-agent: *', 'Allow: /', 'Allow: /api/og/', 'Allow: /uploads/');
    for (const p of PRIVATE_PATHS) lines.push(`Disallow: ${p}`);
    // Sıralama ve filtre parametreli kopya sayfalar
    lines.push('Disallow: /*?*sort=', 'Disallow: /*?*prefix=', 'Disallow: /*?*safemode=');
    const extra = this.settings.get('seo.robotsExtra').trim();
    if (extra) lines.push('', '# Yönetici tarafından eklenen kurallar', extra);
    lines.push('', `Sitemap: ${this.url('/sitemap.xml')}`);
    return `${lines.join('\n')}\n`;
  }

  // ---------- Site haritası ----------

  private async visibleBoardIds(): Promise<number[]> {
    const boards = await this.access.visibleBoards(await this.guest());
    return [...boards.values()].filter((b) => b.board.type !== 'redirect' && !b.board.is_hidden).map((b) => b.board.id);
  }

  async sitemapIndex(): Promise<{ topicPages: number }> {
    const ids = await this.visibleBoardIds();
    if (!ids.length) return { topicPages: 0 };
    const r = await this.db.q
      .selectFrom('topics')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('board_id', 'in', ids)
      .where('deleted_at', 'is', null)
      .where('is_approved', '=', 1)
      .where('moved_to_topic_id', 'is', null)
      .executeTakeFirst();
    return { topicPages: Math.ceil(Number(r?.n ?? 0) / TOPICS_PER_SITEMAP) };
  }

  async sitemapPages(): Promise<SitemapUrl[]> {
    if (!this.settings.get('seo.indexing')) return [];
    const guest = await this.guest();
    const out: SitemapUrl[] = [{ loc: this.url('/'), lastmod: null, priority: 1 }];
    const boards = await this.access.visibleBoards(guest);
    for (const { board } of boards.values()) {
      if (board.type === 'redirect' || board.is_hidden) continue;
      out.push({ loc: this.url(`/f/${board.id}/${board.slug}`), lastmod: board.last_post_at ?? board.updated_at, priority: 0.8 });
    }
    const settings = this.settings.all() as Record<string, unknown>;
    if (pluginEnabled(settings, 'wiki') && can(guest, 'wiki.view')) {
      out.push({ loc: this.url('/wiki'), lastmod: null, priority: 0.7 });
      for (const p of await this.wiki.sitemap()) out.push({ loc: this.url(`/wiki/${p.path}`), lastmod: p.updatedAt, priority: 0.6 });
    }
    const pages = await this.db.q
      .selectFrom('custom_pages')
      .select(['slug', 'updated_at'])
      .where('is_published', '=', 1)
      .where('visibility', 'in', ['all', 'guests'])
      .execute();
    const landing = String(settings['home.landingPage'] ?? '');
    for (const p of pages) if (p.slug !== landing) out.push({ loc: this.url(`/pages/${p.slug}`), lastmod: p.updated_at, priority: 0.6 });
    if (landing && pluginEnabled(settings, 'landing')) out.push({ loc: this.url('/forum'), lastmod: null, priority: 0.9 });
    for (const p of await this.policies.published()) out.push({ loc: this.url(`/policies/${p.key}`), lastmod: p.publishedAt ?? null, priority: 0.3 });
    if (pluginEnabled(settings, 'applications') && can(guest, 'applications.apply')) out.push({ loc: this.url('/applications'), lastmod: null, priority: 0.4 });
    return out;
  }

  async sitemapTopics(page: number): Promise<SitemapUrl[]> {
    if (!this.settings.get('seo.indexing')) return [];
    const ids = await this.visibleBoardIds();
    if (!ids.length) return [];
    const rows = await this.db.q
      .selectFrom('topics')
      .select(['id', 'slug', 'last_post_at', 'is_pinned'])
      .where('board_id', 'in', ids)
      .where('deleted_at', 'is', null)
      .where('is_approved', '=', 1)
      .where('moved_to_topic_id', 'is', null)
      .orderBy('id', 'desc')
      .limit(TOPICS_PER_SITEMAP)
      .offset((Math.max(1, page) - 1) * TOPICS_PER_SITEMAP)
      .execute();
    return rows.map((r) => ({ loc: this.url(`/t/${r.id}/${r.slug}`), lastmod: r.last_post_at, priority: r.is_pinned ? 0.7 : 0.5 }));
  }

  // ---------- Gömülü konu kartı / oEmbed ----------

  /** Misafirin görebildiği konu için kart verisi; göremiyorsa null */
  async topicEmbed(id: number): Promise<TopicEmbed | null> {
    const t = await this.db.q.selectFrom('topics').selectAll().where('id', '=', id).where('deleted_at', 'is', null).where('is_approved', '=', 1).executeTakeFirst();
    if (!t) return null;
    const board = await this.access.access(await this.guest(), t.board_id);
    if (!board) return null;
    const first = t.first_post_id ? await this.db.q.selectFrom('posts').select(['body_html']).where('id', '=', t.first_post_id).executeTakeFirst() : null;
    const author = t.user_id ? ((await this.users.summaries([t.user_id])).get(t.user_id) ?? null) : null;
    return {
      id: t.id,
      title: t.title,
      url: this.url(`/t/${t.id}/${t.slug}`),
      excerpt: plainExcerpt(first?.body_html ?? '', 280),
      board: { name: board.board.name, url: this.url(`/f/${board.board.id}/${board.board.slug}`) },
      author: {
        name: author?.displayName ?? t.author_name,
        avatarUrl: author?.avatarUrl ? this.url(author.avatarUrl) : null,
        url: author ? this.url(`/u/${author.id}/${author.slug}`) : null,
      },
      replyCount: t.reply_count,
      viewCount: t.view_count,
      createdAt: t.created_at,
      lastPostAt: t.last_post_at,
      forum: {
        name: String(this.settings.get('general.forumName')),
        url: this.config.appUrl,
        icon: this.settings.get('appearance.faviconUrl') ? this.url(String(this.settings.get('appearance.faviconUrl'))) : this.url('/brand/inkforum-icon-192.png'),
        accent: String(this.settings.get('appearance.accentColor') ?? '#7b61ff'),
      },
    };
  }

  /** oEmbed (https://oembed.com): konu adresinden gömülebilir kart */
  async oembed(rawUrl: string, maxwidth?: number): Promise<Record<string, unknown> | null> {
    let u: URL;
    try {
      u = new URL(rawUrl);
    } catch {
      return null;
    }
    if (u.origin !== this.config.appOrigin) return null;
    const m = /^\/t\/(\d+)(?:\/|$)/.exec(u.pathname) ?? /^\/embed\/t\/(\d+)$/.exec(u.pathname);
    if (!m) return null;
    const card = await this.topicEmbed(Number(m[1]));
    if (!card) return null;
    const width = Math.min(Math.max(Number(maxwidth) || 560, 280), 720);
    const height = 220;
    const src = this.url(`/embed/t/${card.id}`);
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return {
      version: '1.0',
      type: 'rich',
      title: card.title,
      author_name: card.author.name,
      ...(card.author.url ? { author_url: card.author.url } : {}),
      provider_name: card.forum.name,
      provider_url: card.forum.url,
      cache_age: 3600,
      width,
      height,
      html: `<iframe src="${esc(src)}" width="${width}" height="${height}" style="border:0;border-radius:12px;max-width:100%" loading="lazy" title="${esc(card.title)}"></iframe>`,
      ...(this.settings.get('seo.ogImages') ? { thumbnail_url: this.url(`/api/og/t/${card.id}.png`), thumbnail_width: 1200, thumbnail_height: 630 } : {}),
    };
  }

  // ---------- Paylaşım görselleri ----------

  /** Görsel üretilemiyorsa kullanılacak site görseli (banner → logo → InkForum simgesi) */
  fallbackImage(): string {
    const banner = this.settings.get('appearance.bannerUrl');
    // Hazır InkForum yazı logosu şeffaf/tek renktir; paylaşım kartında simge daha iyi görünür
    const logo = String(this.settings.get('appearance.logoUrl') || '');
    const customLogo = logo && !logo.startsWith('/brand/') ? logo : '';
    return String(banner || customLogo || '/brand/inkforum-icon-512.png');
  }

  /** Konu kartı PNG'si (sharp varsa); yoksa null → çağıran yedek görsele yönlendirir */
  async topicImage(id: number): Promise<Buffer | null> {
    if (!this.settings.get('seo.ogImages')) return null;
    const sharp = await this.storage.loadSharp();
    if (!sharp) return null;
    const card = await this.topicEmbed(id);
    if (!card) return null;
    const svg = this.cardSvg({
      kicker: card.board.name,
      title: card.title,
      meta: `${card.author.name}  ·  ${card.replyCount} yanıt  ·  ${card.viewCount} görüntülenme`,
      forum: card.forum.name,
      accent: card.forum.accent,
    });
    return this.render(sharp, svg, `t${id}`);
  }

  /** Site geneli kart (ana sayfa, bölümler) */
  async siteImage(): Promise<Buffer | null> {
    if (!this.settings.get('seo.ogImages')) return null;
    const sharp = await this.storage.loadSharp();
    if (!sharp) return null;
    const name = String(this.settings.get('general.forumName'));
    const svg = this.cardSvg({
      kicker: new URL(this.config.appUrl).host,
      title: name,
      meta: String(this.settings.get('general.forumDescription') ?? '').slice(0, 110),
      forum: name,
      accent: String(this.settings.get('appearance.accentColor') ?? '#7b61ff'),
    });
    return this.render(sharp, svg, 'site');
  }

  private async render(sharp: NonNullable<Awaited<ReturnType<StorageService['loadSharp']>>>, svg: string, key: string): Promise<Buffer | null> {
    const hash = createHash('sha1').update(svg).digest('hex').slice(0, 16);
    const dir = join(this.config.storageDir, 'cache', 'og');
    const file = join(dir, `${key}-${hash}.png`);
    if (existsSync(file)) return readFileSync(file);
    try {
      const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, png);
      return png;
    } catch (err) {
      this.logger.warn(`Paylaşım görseli üretilemedi: ${String(err)}`);
      return null;
    }
  }

  private cardSvg(c: { kicker: string; title: string; meta: string; forum: string; accent: string }): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const accent = /^#[0-9a-f]{6}$/i.test(c.accent) ? c.accent : '#7b61ff';
    const lines = wrap(c.title, 30, 3);
    const size = lines.length > 2 ? 58 : 66;
    const startY = 250 - (lines.length - 1) * (size * 0.6);
    const title = lines.map((l, i) => `<text x="80" y="${Math.round(startY + i * size * 1.18)}" font-size="${size}" font-weight="800" fill="#ffffff">${esc(l)}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
<radialGradient id="g" cx="0.9" cy="0" r="0.9"><stop offset="0" stop-color="${accent}" stop-opacity="0.55"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151821"/><stop offset="1" stop-color="#0b0d12"/></linearGradient>
</defs>
<rect width="1200" height="630" fill="url(#b)"/>
<rect width="1200" height="630" fill="url(#g)"/>
<rect x="80" y="84" width="64" height="8" rx="4" fill="${accent}"/>
<g font-family="Roboto, 'DejaVu Sans', 'Noto Sans', Arial, sans-serif">
<text x="80" y="140" font-size="30" font-weight="600" fill="#ffffff" fill-opacity="0.7">${esc(truncate(c.kicker, 50))}</text>
${title}
<text x="80" y="520" font-size="28" fill="#ffffff" fill-opacity="0.72">${esc(truncate(c.meta, 70))}</text>
<text x="80" y="572" font-size="30" font-weight="800" fill="${accent}">${esc(truncate(c.forum, 40))}</text>
</g>
</svg>`;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Başlığı satırlara böler (en fazla `max` satır, sonuncusu gerekirse kısaltılır) */
function wrap(text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (`${cur} ${w}`.length <= width) cur = `${cur} ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > max) {
    const kept = lines.slice(0, max);
    kept[max - 1] = truncate(`${kept[max - 1]} ${lines.slice(max).join(' ')}`, width);
    return kept;
  }
  return lines.map((l) => truncate(l, width + 6));
}
