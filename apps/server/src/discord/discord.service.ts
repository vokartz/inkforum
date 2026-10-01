import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { bbcodeExcerpt, type DiscordSettingsInput, type DiscordWidget } from '@forum/shared';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { EventsService } from '../events/events.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { CryptoService } from '../security/crypto.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ForumAccessService } from '../forum/forum-access.service.js';
import { ViewerService } from '../auth/viewer.service.js';

interface DiscordConfig {
  webhookEnc: string;
  boardIds: number[];
  replies: boolean;
  guildId: string;
  inviteUrl: string;
}

const WIDGET_TTL = 5 * 60_000;

/**
 * Discord entegrasyonu: yeni konular (isteğe bağlı yanıtlar) webhook ile kanala gönderilir;
 * ana sayfadaki blok sunucunun widget verisini (çevrimiçi sayısı, davet) gösterir.
 * Yalnızca misafirlerin görebildiği içerik gönderilir; gizli ve onay bekleyen konular gönderilmez.
 */
@Injectable()
export class DiscordService implements OnModuleInit {
  private readonly logger = new Logger('Discord');
  private widgetCache: { at: number; guildId: string; value: DiscordWidget | null } | null = null;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
    private readonly jobs: JobsService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly access: ForumAccessService,
    private readonly viewers: ViewerService,
  ) {}

  onModuleInit(): void {
    this.events.on('topic.created', (e) => this.queue(e.postId, true));
    this.events.on('post.created', (e) => this.queue(e.postId, false));
    this.jobs.register<{ postId: number; isTopic: boolean }>('discord.post', (p) =>
      this.send(p.postId, p.isTopic),
    );
  }

  private cfg(): DiscordConfig {
    return this.settings.get('discord.config') as DiscordConfig;
  }

  /** Yönetim ekranı için (webhook adresi gizli) */
  adminView() {
    const c = this.cfg();
    return {
      hasWebhook: !!c.webhookEnc,
      boardIds: c.boardIds,
      replies: c.replies,
      guildId: c.guildId,
      inviteUrl: c.inviteUrl,
    };
  }

  async save(input: DiscordSettingsInput, actorId: number): Promise<void> {
    const prev = this.cfg();
    const webhookEnc =
      input.webhookUrl === 'keep'
        ? prev.webhookEnc
        : input.webhookUrl
          ? this.crypto.encrypt(input.webhookUrl)
          : '';
    await this.settings.update(
      {
        'discord.config': {
          webhookEnc,
          boardIds: input.boardIds,
          replies: input.replies,
          guildId: input.guildId,
          inviteUrl: input.inviteUrl,
        },
      },
      actorId,
      { allowHidden: true },
    );
    this.widgetCache = null;
    await this.audit.log({
      type: 'admin',
      action: 'discord.settings',
      actorId,
      data: { webhook: !!webhookEnc, boards: input.boardIds.length, replies: input.replies },
    });
  }

  private async queue(postId: number, isTopic: boolean): Promise<void> {
    if (!this.settings.plugin('discord')) return;
    const c = this.cfg();
    if (!c.webhookEnc || (!isTopic && !c.replies)) return;
    await this.jobs.enqueue('discord.post', { postId, isTopic }, { maxAttempts: 3 });
  }

  private webhook(): string | null {
    const enc = this.cfg().webhookEnc;
    if (!enc) return null;
    try {
      return this.crypto.decrypt(enc);
    } catch {
      return null;
    }
  }

  /** Mesajı misafir görebiliyorsa Discord'a gönderir */
  private async send(postId: number, isTopic: boolean): Promise<void> {
    const url = this.webhook();
    if (!url || !this.settings.plugin('discord')) return;
    const post = await this.db.q
      .selectFrom('posts')
      .innerJoin('topics', 'topics.id', 'posts.topic_id')
      .select([
        'posts.id',
        'posts.body_bbcode',
        'posts.author_name',
        'posts.user_id',
        'posts.is_approved',
        'posts.deleted_at',
        'posts.created_at',
        'topics.id as topic_id',
        'topics.title',
        'topics.slug',
        'topics.board_id',
        'topics.is_hidden',
        'topics.is_approved as topic_approved',
      ])
      .where('posts.id', '=', postId)
      .executeTakeFirst();
    if (!post || post.deleted_at || !post.is_approved || !post.topic_approved || post.is_hidden) return;
    const c = this.cfg();
    if (c.boardIds.length && !c.boardIds.includes(post.board_id)) return;
    const guest = await this.viewers.forUser(null, null, null, null);
    const board = await this.access.access(guest, post.board_id);
    if (!board) return;
    const base = this.config.appUrl;
    const link = isTopic ? `${base}/t/${post.topic_id}/${post.slug}` : `${base}/p/${post.id}`;
    const author = post.user_id
      ? await this.db.q
          .selectFrom('users')
          .select(['display_name'])
          .where('id', '=', post.user_id)
          .executeTakeFirst()
      : null;
    const color = parseInt(
      String(this.settings.get('appearance.accentColor') ?? '#7b61ff').replace('#', ''),
      16,
    );
    const body = {
      username: String(this.settings.get('general.forumName') ?? 'Forum').slice(0, 80),
      allowed_mentions: { parse: [] as string[] },
      embeds: [
        {
          title: (isTopic ? post.title : `↳ ${post.title}`).slice(0, 256),
          url: link,
          description: bbcodeExcerpt(post.body_bbcode, 350),
          color: Number.isFinite(color) ? color : 0x7b61ff,
          author: { name: (author?.display_name ?? post.author_name).slice(0, 256) },
          footer: { text: `${board.board.name}${isTopic ? '' : ' · yanıt'}`.slice(0, 2048) },
          timestamp: new Date(post.created_at).toISOString(),
        },
      ],
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 429) throw new Error('Discord hız sınırı; yeniden denenecek.');
    if (!res.ok) this.logger.warn(`Discord webhook ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  /** Ayarlar ekranındaki "Deneme mesajı gönder" */
  async test(): Promise<void> {
    const url = this.webhook();
    if (!url) throw Errors.badRequest('Önce webhook adresini kaydedin.');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: String(this.settings.get('general.forumName') ?? 'Forum'),
        content: `✅ ${this.config.appUrl} bağlantısı çalışıyor.`,
      }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!res?.ok)
      throw Errors.badRequest(
        `Discord mesajı kabul etmedi${res ? ` (${res.status})` : ''}. Webhook adresini kontrol edin.`,
      );
  }

  /** Sunucu widget'ı (Sunucu Ayarları → Widget → "Sunucu widget'ını etkinleştir" açık olmalı) */
  async widget(): Promise<DiscordWidget | null> {
    const c = this.cfg();
    if (!c.guildId) return null;
    if (
      this.widgetCache &&
      this.widgetCache.guildId === c.guildId &&
      this.clock.now() - this.widgetCache.at < WIDGET_TTL
    )
      return this.widgetCache.value;
    let value: DiscordWidget | null = null;
    try {
      const res = await fetch(`https://discord.com/api/guilds/${c.guildId}/widget.json`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const w = (await res.json()) as {
          name?: string;
          presence_count?: number;
          instant_invite?: string | null;
          members?: Array<{ username: string; avatar_url?: string; status: string }>;
        };
        value = {
          name: w.name ?? 'Discord',
          online: Number(w.presence_count ?? 0),
          inviteUrl: c.inviteUrl || w.instant_invite || null,
          members: (w.members ?? [])
            .slice(0, 12)
            .map((m) => ({ name: m.username, avatarUrl: m.avatar_url ?? null, status: m.status })),
        };
      }
    } catch {
      /* Discord'a ulaşılamadı */
    }
    this.widgetCache = { at: this.clock.now(), guildId: c.guildId, value };
    return value;
  }
}
