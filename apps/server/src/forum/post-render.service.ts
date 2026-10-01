import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { renderBBCode, slugify, type BBRenderResult, type EmbedOptions, type EmojiRenderOptions } from '@forum/shared';
import { emojiOptions } from '../common/emoji.js';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Db } from '../database/db.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { RERENDER_JOB } from './render-jobs.js';
import { EmojisService } from './emojis.service.js';

/** BBCode kuralları değiştiğinde artırılır; eski mesajlar arka planda yeniden işlenir. */
export const RENDER_VERSION = 2;
const BATCH = 200;

const profileHref = (id: number, name: string) => `/u/${id}/${slugify(name)}`;
const postHref = (id: number) => `/p/${id}`;

@Injectable()
export class PostRenderService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger('PostRender');

  constructor(
    private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly jobs: JobsService,
    private readonly emojis: EmojisService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.jobs.register<{ afterId?: number }>(RERENDER_JOB, (p) => this.rerenderBatch(p.afterId ?? 0));
  }

  /** Yeni sürümde BBCode kuralları değiştiyse eski mesajları arka planda yeniden işle. */
  async onApplicationBootstrap(): Promise<void> {
    if (this.config.isTest) return;
    const pending = await this.db.q
      .selectFrom('jobs')
      .select('id')
      .where('type', '=', RERENDER_JOB)
      .where('status', 'in', ['pending', 'running'])
      .executeTakeFirst();
    if (!pending) await this.scheduleRerenderIfNeeded();
  }

  /** Gömülü içerik sağlayıcı ayarları. */
  embedOptions(): EmbedOptions {
    return {
      host: new URL(this.config.appUrl).hostname,
      disabled: this.settings.get('embeds.disabledProviders'),
      custom: this.settings.get('embeds.custom'),
    };
  }

  /** Twemoji + özel emojiler. */
  private emojiOpts(): EmojiRenderOptions {
    return { ...emojiOptions, custom: this.emojis.lookup };
  }

  /** Mesaj gövdesi. */
  post(bbcode: string, embeds: EmbedOptions = this.embedOptions()): BBRenderResult {
    return renderBBCode(bbcode, {
      media: this.settings.get('embeds.enabled'),
      autoEmbed: this.settings.get('embeds.autoEmbed'),
      clickToLoad: this.settings.get('embeds.clickToLoad'),
      embeds,
      maxQuoteDepth: this.settings.get('forum.maxQuoteDepth'),
      profileHref,
      postHref,
      emoji: this.emojiOpts(),
    });
  }

  /** İmza / hakkımda gibi kısa metinler: bloklar serbest, video yok. */
  short(bbcode: string, opts: { images?: boolean } = {}): string {
    return renderBBCode(bbcode, { media: false, images: opts.images ?? true, maxQuoteDepth: 1, profileHref, postHref, emoji: this.emojiOpts() }).html;
  }

  /** Tüm mesajları yeniden işlenmek üzere işaretler (gömülü içerik ayarları değişince). */
  async invalidateAll(): Promise<void> {
    await this.db.q.updateTable('posts').set({ render_version: 0 }).execute();
    await this.jobs.enqueue(RERENDER_JOB, { afterId: 0 });
  }

  /** Eski sürümle işlenmiş mesaj varsa yeniden işleme işini başlatır. */
  async scheduleRerenderIfNeeded(): Promise<void> {
    const stale = await this.db.q.selectFrom('posts').select('id').where('render_version', '<', RENDER_VERSION).limit(1).executeTakeFirst();
    if (stale) await this.jobs.enqueue(RERENDER_JOB, { afterId: 0 });
  }

  private async rerenderBatch(afterId: number): Promise<void> {
    const rows = await this.db.q
      .selectFrom('posts')
      .select(['id', 'body_bbcode'])
      .where('id', '>', afterId)
      .where('render_version', '<', RENDER_VERSION)
      .orderBy('id')
      .limit(BATCH)
      .execute();
    for (const r of rows) {
      await this.db.q
        .updateTable('posts')
        .set({ body_html: this.post(r.body_bbcode).html, render_version: RENDER_VERSION })
        .where('id', '=', r.id)
        .execute();
    }
    if (rows.length === BATCH) await this.jobs.enqueue(RERENDER_JOB, { afterId: rows[rows.length - 1]!.id });
    else this.logger.log('Mesajlar yeniden işlendi.');
  }
}
