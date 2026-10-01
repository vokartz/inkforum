import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { plainExcerpt, pluginEnabled, type OgCard, type TopicEmbed } from '@forum/shared';
import { renderCardSvg, type CardAssets, type CardContent } from './og-card.js';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Db } from '../database/db.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { ViewerService } from '../auth/viewer.service.js';
import { ForumAccessService } from '../forum/forum-access.service.js';
import { UsersService } from '../users/users.service.js';
import { WikiService } from '../wiki/wiki.service.js';
import { PoliciesService } from '../policies/policies.service.js';
import { StorageService } from '../storage/storage.service.js';
import { I18nService } from '../i18n/i18n.service.js';
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
    private readonly i18n: I18nService,
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
      .where('is_hidden', '=', 0)
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
      .where('is_hidden', '=', 0)
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
    const t = await this.db.q.selectFrom('topics').selectAll().where('id', '=', id).where('deleted_at', 'is', null).where('is_approved', '=', 1).where('is_hidden', '=', 0).executeTakeFirst();
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
    // Görsel herkese aynıdır: forumun varsayılan dilinde
    const locale = this.i18n.defaultLocale();
    const svg = this.cardSvg({
      kicker: card.board.name,
      title: card.title,
      meta: [card.author.name, this.i18n.t(locale, '{n} yanıt', { n: card.replyCount }), this.i18n.t(locale, '{n} görüntülenme', { n: card.viewCount })].join('  ·  '),
      forum: card.forum.name,
    });
    return this.render(sharp, svg, `t${id}`);
  }

  /**
   * Her sayfa için paylaşım kartı (Discord, X, WhatsApp…): adresten herkese açık başlık çözülür.
   * Yalnızca veritabanındaki görünür içerik kullanılır; tanınmayan adresler site kartını alır.
   */
  async pageImage(rawPath: string): Promise<Buffer | null> {
    if (!this.settings.get('seo.ogImages')) return null;
    const path = `/${String(rawPath || '/').split(/[?#]/)[0]!.replace(/^\/+/, '').slice(0, 300)}`;
    const topic = /^\/t\/(\d+)(?:\/|$)/.exec(path);
    if (topic) return this.topicImage(Number(topic[1]));
    const card = await this.pageCard(path);
    if (!card) return this.siteImage();
    const sharp = await this.storage.loadSharp();
    if (!sharp) return null;
    const name = String(this.settings.get('general.forumName'));
    const svg = this.cardSvg({ kicker: card.kicker, title: card.title, meta: card.meta ?? '', forum: name });
    return this.render(sharp, svg, `p${createHash('sha1').update(path).digest('hex').slice(0, 10)}`);
  }

  private async pageCard(path: string): Promise<{ kicker: string; title: string; meta?: string } | null> {
    const locale = this.i18n.defaultLocale();
    const tr = (text: string, params?: Record<string, string | number>) => this.i18n.t(locale, text, params);
    const host = new URL(this.config.appUrl).host;
    const settings = this.settings.all() as Record<string, unknown>;
    const guest = await this.guest();
    let m: RegExpExecArray | null;
    if ((m = /^\/f\/(\d+)(?:\/|$)/.exec(path))) {
      const boards = await this.access.visibleBoards(guest);
      const b = boards.get(Number(m[1]))?.board;
      if (!b || b.is_hidden) return null;
      const cat = await this.db.q.selectFrom('forum_categories').select('name').where('id', '=', b.category_id).executeTakeFirst();
      const counts = tr('{topics} konu · {posts} mesaj', { topics: b.topic_count, posts: b.post_count });
      return { kicker: cat?.name || host, title: b.name, meta: b.description ? `${b.description.slice(0, 90)}  ·  ${counts}` : counts };
    }
    if ((m = /^\/u\/(\d+)(?:\/|$)/.exec(path))) {
      if (!can(guest, 'profile.view')) return null;
      const u = await this.db.q.selectFrom('users').select(['display_name', 'post_count']).where('id', '=', Number(m[1])).where('status', '=', 'active').executeTakeFirst();
      if (!u) return null;
      return { kicker: tr('Üye profili'), title: u.display_name, meta: tr('{n} mesaj', { n: u.post_count }) };
    }
    if ((m = /^\/pages\/([\w-]+)$/.exec(path))) {
      const pg = await this.db.q
        .selectFrom('custom_pages')
        .select(['title', 'meta_description'])
        .where('slug', '=', m[1]!.toLowerCase())
        .where('is_published', '=', 1)
        .where('visibility', 'in', ['all', 'guests'])
        .executeTakeFirst();
      return pg ? { kicker: host, title: pg.title, meta: pg.meta_description ?? '' } : null;
    }
    if ((m = /^\/wiki\/(.+)$/.exec(path)) && pluginEnabled(settings, 'wiki') && can(guest, 'wiki.view')) {
      const wikiPath = decodeURIComponent(m[1]!);
      const pg = (await this.wiki.sitemap()).find((p) => p.path === wikiPath);
      return pg ? { kicker: String(settings['wiki.name'] || 'Wiki'), title: pg.title } : null;
    }
    if ((m = /^\/tags\/([^/]+)$/.exec(path))) return { kicker: tr('Etiket'), title: `#${decodeURIComponent(m[1]!).slice(0, 60)}` };
    if ((m = /^\/policies\/([\w-]+)$/.exec(path))) {
      const pol = (await this.policies.published()).find((p) => p.key === m![1]);
      return pol ? { kicker: host, title: tr(pol.title) } : null;
    }
    const STATIC: Record<string, string> = {
      '/forum': 'Forum',
      '/members': 'Üyeler',
      '/groups': 'Gruplar',
      '/online': 'Çevrimiçi',
      '/search': 'Arama',
      '/achievements': 'Başarılar',
      '/applications': 'Başvurular',
      '/tickets': 'Destek',
      '/developers': 'Geliştirici belgeleri',
      '/cookies': 'Çerezler',
      '/register': 'Kayıt ol',
      '/login': 'Giriş yap',
    };
    if (path === '/wiki' && pluginEnabled(settings, 'wiki')) return { kicker: host, title: String(settings['wiki.name'] || 'Wiki'), meta: tr(String(settings['wiki.description'] ?? '')) };
    if (STATIC[path]) return { kicker: host, title: tr(STATIC[path]), meta: String(settings['general.forumDescription'] ?? '').slice(0, 110) };
    return null;
  }

  /** Site geneli kart (ana sayfa, bölümler) */
  async siteImage(): Promise<Buffer | null> {
    if (!this.settings.get('seo.ogImages')) return null;
    const sharp = await this.storage.loadSharp();
    if (!sharp) return null;
    const svg = this.cardSvg(this.siteContent());
    return this.render(sharp, svg, 'site');
  }

  private async render(sharp: NonNullable<Awaited<ReturnType<StorageService['loadSharp']>>>, svg: string, key: string): Promise<Buffer | null> {
    // OG_RENDER: yazı tipi / çizim değişince eski (bozuk) önbellek görselleri kullanılmasın
    const hash = createHash('sha1').update(`${OG_RENDER}:${svg}`).digest('hex').slice(0, 16);
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

  private siteContent(): CardContent {
    const name = String(this.settings.get('general.forumName'));
    return { kicker: new URL(this.config.appUrl).host, title: name, meta: String(this.settings.get('general.forumDescription') ?? '').slice(0, 110), forum: name };
  }

  /** Kart tasarımı (Yönetim → SEO → Paylaşım kartı) ile SVG */
  private cardSvg(c: CardContent, design?: OgCard): string {
    const card = design ?? this.settings.get('seo.ogCard');
    return renderCardSvg(c, card, String(this.settings.get('appearance.accentColor') ?? '#7b61ff'), this.cardAssets(card));
  }

  /** Logo ve arka plan görseli: yalnızca bu forumun yüklemeleri, data: adresi olarak gömülür */
  private assetCache = new Map<string, { mtime: number; uri: string }>();
  private cardAssets(card: OgCard): CardAssets {
    const logo = this.settings.get('appearance.logoUrl');
    return { logo: card.logo ? this.uploadDataUri(typeof logo === 'string' ? logo : '') : null, background: card.background.kind === 'image' ? this.uploadDataUri(card.background.image) : null };
  }
  private uploadDataUri(url: string): string | null {
    const m = /^\/uploads\/([\w./-]+)$/.exec(url);
    if (!m || m[1]!.includes('..')) return null;
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[m[1]!.split('.').pop()!.toLowerCase()];
    if (!mime) return null;
    const file = join(this.config.uploadsDir, m[1]!);
    try {
      const mtime = statSync(file).mtimeMs;
      const hit = this.assetCache.get(file);
      if (hit && hit.mtime === mtime) return hit.uri;
      const uri = `data:${mime};base64,${readFileSync(file).toString('base64')}`;
      if (this.assetCache.size > 20) this.assetCache.clear();
      this.assetCache.set(file, { mtime, uri });
      return uri;
    } catch {
      return null;
    }
  }

  /** Yönetimdeki tasarım ekranının canlı önizlemesi (kaydedilmemiş tasarımla, önbelleksiz) */
  async previewImage(card: OgCard, sample: 'topic' | 'site' | 'board'): Promise<{ type: string; data: Buffer }> {
    const locale = this.i18n.defaultLocale();
    let content = this.siteContent();
    if (sample === 'topic') {
      const last = await this.db.q.selectFrom('topics').select('id').where('deleted_at', 'is', null).orderBy('id', 'desc').limit(20).execute();
      for (const t of last) {
        const e = await this.topicEmbed(t.id);
        if (!e) continue;
        content = {
          kicker: e.board.name,
          title: e.title,
          meta: [e.author.name, this.i18n.t(locale, '{n} yanıt', { n: e.replyCount }), this.i18n.t(locale, '{n} görüntülenme', { n: e.viewCount })].join('  ·  '),
          forum: e.forum.name,
        };
        break;
      }
    } else if (sample === 'board') {
      const boards = [...(await this.access.visibleBoards(await this.guest())).values()].map((v) => v.board).filter((b) => !b.is_hidden);
      const first = boards[0];
      const board = first ? await this.pageCard(`/f/${first.id}`) : null;
      if (board) content = { kicker: board.kicker, title: board.title, meta: board.meta ?? '', forum: content.forum };
    }
    const svg = Buffer.from(this.cardSvg(content, card));
    // sharp yoksa (ör. geliştirme ortamı) SVG'nin kendisi gösterilir; yazı tipleri tarayıcınınkidir
    const sharp = await this.storage.loadSharp();
    return sharp ? { type: 'image/png', data: await sharp(svg).png().toBuffer() } : { type: 'image/svg+xml', data: svg };
  }
}

/** Paylaşım görseli çizim sürümü (önbellek anahtarına girer) */
const OG_RENDER = 3;

