import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { shortcodeFromFilename, EMOJI_SHORTCODE, type AdminCustomEmoji, type CustomEmoji } from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { StorageService } from '../storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import type { RequestViewer } from '../common/request-context.js';
import type { UploadedImage } from '../common/upload.js';
import { RENDER_VERSION_STALE, RERENDER_JOB } from './render-jobs.js';

type EmojiRow = Row<'custom_emojis'>;
const MAX_EMOJIS = 2000;

@Injectable()
export class EmojisService implements OnApplicationBootstrap {
  private map = new Map<string, { url: string; name: string }>();
  private list: CustomEmoji[] = [];

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    const rows = await this.db.q.selectFrom('custom_emojis').selectAll().where('is_enabled', '=', 1).orderBy('category').orderBy('sort_order').orderBy('shortcode').execute();
    this.map = new Map(rows.map((r) => [r.shortcode, { url: r.url, name: r.name }]));
    this.list = rows.map((r) => ({ id: r.id, shortcode: r.shortcode, name: r.name, category: r.category, url: r.url }));
  }

  lookup = (code: string) => this.map.get(code);

  enabled(): CustomEmoji[] {
    return this.list;
  }

  private toAdmin(r: EmojiRow): AdminCustomEmoji {
    return { id: r.id, shortcode: r.shortcode, name: r.name, category: r.category, url: r.url, isEnabled: r.is_enabled === 1, sortOrder: r.sort_order, createdAt: r.created_at };
  }

  async adminList(): Promise<AdminCustomEmoji[]> {
    const rows = await this.db.q.selectFrom('custom_emojis').selectAll().orderBy('category').orderBy('sort_order').orderBy('shortcode').execute();
    return rows.map((r) => this.toAdmin(r));
  }

  private async rerender(codes: string[]): Promise<void> {
    for (const code of codes) {
      await this.db.q
        .updateTable('posts')
        .set({ render_version: RENDER_VERSION_STALE })
        .where('body_bbcode', 'like', `%:${code}:%`)
        .execute();
    }
    await this.jobs.enqueue(RERENDER_JOB, { afterId: 0 });
  }

  private async assertFree(shortcode: string, exceptId: number | null): Promise<void> {
    if (!EMOJI_SHORTCODE.test(shortcode)) throw Errors.field('shortcode', 'Kısa ad 2–32 karakter; yalnızca küçük harf, rakam, _ ve - olabilir.');
    const clash = await this.db.q.selectFrom('custom_emojis').select('id').where('shortcode', '=', shortcode).executeTakeFirst();
    if (clash && clash.id !== exceptId) throw Errors.field('shortcode', `:${shortcode}: zaten kullanılıyor.`);
  }

  async upload(viewer: RequestViewer, file: UploadedImage, input: { shortcode?: string; category?: string }): Promise<AdminCustomEmoji> {
    const count = await this.db.q.selectFrom('custom_emojis').select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst();
    if (Number(count?.n ?? 0) >= MAX_EMOJIS) throw Errors.badRequest(`En fazla ${MAX_EMOJIS} özel emoji eklenebilir.`);
    const original = Buffer.from(file.originalname ?? '', 'latin1').toString('utf8');
    const shortcode = (input.shortcode?.trim().toLowerCase().replace(/^:|:$/g, '') || shortcodeFromFilename(original)).slice(0, 32);
    await this.assertFree(shortcode, null);
    const category = (input.category?.trim() || 'Özel').slice(0, 40);
    const saved = await this.storage.saveImage(file.buffer, { purpose: 'emoji', ownerUserId: viewer.user!.id, maxBytes: 512 * 1024, maxDimension: 512 });
    const url = this.storage.publicUrl(saved)!;
    const row = await this.db.q
      .insertInto('custom_emojis')
      .values({ shortcode, name: shortcode.replace(/[_-]+/g, ' '), category, file_id: saved.id, url, created_by: viewer.user!.id, created_at: this.clock.now() })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.reload();
    await this.rerender([shortcode]);
    await this.audit.log({ type: 'admin', action: 'emoji.create', actorId: viewer.user!.id, ip: viewer.ip, data: { id: row.id, shortcode } });
    return this.toAdmin(await this.db.q.selectFrom('custom_emojis').selectAll().where('id', '=', row.id).executeTakeFirstOrThrow());
  }

  async update(viewer: RequestViewer, id: number, input: { shortcode: string; name: string; category: string; isEnabled: boolean }): Promise<AdminCustomEmoji> {
    const prev = await this.db.q.selectFrom('custom_emojis').selectAll().where('id', '=', id).executeTakeFirst();
    if (!prev) throw Errors.notFound('Emoji bulunamadı.');
    await this.assertFree(input.shortcode, id);
    await this.db.q
      .updateTable('custom_emojis')
      .set({ shortcode: input.shortcode, name: input.name, category: input.category, is_enabled: input.isEnabled ? 1 : 0 })
      .where('id', '=', id)
      .execute();
    await this.reload();
    if (prev.shortcode !== input.shortcode || (prev.is_enabled === 1) !== input.isEnabled || prev.name !== input.name) await this.rerender([...new Set([prev.shortcode, input.shortcode])]);
    await this.audit.log({ type: 'admin', action: 'emoji.update', actorId: viewer.user!.id, ip: viewer.ip, data: { id, shortcode: input.shortcode } });
    return this.toAdmin(await this.db.q.selectFrom('custom_emojis').selectAll().where('id', '=', id).executeTakeFirstOrThrow());
  }

  async remove(viewer: RequestViewer, id: number): Promise<void> {
    const prev = await this.db.q.selectFrom('custom_emojis').selectAll().where('id', '=', id).executeTakeFirst();
    if (!prev) throw Errors.notFound('Emoji bulunamadı.');
    await this.db.q.deleteFrom('custom_emojis').where('id', '=', id).execute();
    if (prev.file_id) await this.storage.delete(prev.file_id);
    await this.reload();
    await this.rerender([prev.shortcode]);
    await this.audit.log({ type: 'admin', action: 'emoji.delete', actorId: viewer.user!.id, ip: viewer.ip, data: { id, shortcode: prev.shortcode } });
  }
}
