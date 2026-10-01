import { createHash } from 'node:crypto';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FilePurpose, Row } from '@forum/db';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { EXTENSION, sniffImage, type ImageInfo } from './image.js';

export interface SaveImageOptions {
  purpose: FilePurpose;
  ownerUserId: number | null;
  maxBytes: number;
  maxDimension?: number;
  /** Kare küçültme hedefi (sharp varsa uygulanır). */
  resizeTo?: number;
  allowGif?: boolean;
}

type SharpFactory = (input: Buffer, opts?: object) => {
  rotate(): ReturnType<SharpFactory>;
  resize(w: number, h: number, opts?: object): ReturnType<SharpFactory>;
  webp(opts?: object): ReturnType<SharpFactory>;
  png(opts?: object): ReturnType<SharpFactory>;
  toBuffer(): Promise<Buffer>;
};

/** Yerel disk depolaması (S3 sürücüsü ileride aynı arayüzle eklenecek). */
@Injectable()
export class StorageService {
  private readonly logger = new Logger('Storage');
  private sharp: SharpFactory | null | undefined;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  publicUrl(file: { path: string } | null | undefined): string | null {
    return file ? `/uploads/${file.path}` : null;
  }

  async loadSharp(): Promise<SharpFactory | null> {
    if (this.sharp !== undefined) return this.sharp;
    if (this.config.imageDriver === 'passthrough') return (this.sharp = null);
    try {
      const name = 'sharp';
      const mod = (await import(name)) as { default: SharpFactory & { concurrency(n: number): void; cache(v: boolean): void } };
      mod.default.concurrency(1);
      mod.default.cache(false);
      this.sharp = mod.default;
      this.logger.log('Görsel işleme: sharp');
    } catch {
      if (this.config.imageDriver === 'sharp') this.logger.warn('IMAGE_DRIVER=sharp ama sharp yüklü değil; passthrough kullanılıyor.');
      this.sharp = null;
    }
    return this.sharp;
  }

  async saveImage(input: Buffer, opts: SaveImageOptions): Promise<Row<'files'>> {
    if (input.length > opts.maxBytes) {
      throw Errors.field('file', `Dosya en fazla ${Math.round(opts.maxBytes / 1024)} KB olabilir.`);
    }
    let info: ImageInfo | null = sniffImage(input);
    if (!info || (info.type === 'gif' && opts.allowGif === false)) {
      throw Errors.field('file', 'Yalnızca PNG, JPEG, WEBP' + (opts.allowGif === false ? '' : ' veya GIF') + ' görselleri yüklenebilir.');
    }
    const maxDim = opts.maxDimension ?? 4096;
    if (info.width < 1 || info.height < 1 || info.width > maxDim || info.height > maxDim) {
      throw Errors.field('file', `Görsel boyutu en fazla ${maxDim}×${maxDim} piksel olabilir.`);
    }

    let data = input;
    const sharp = opts.resizeTo && info.type !== 'gif' ? await this.loadSharp() : null;
    if (sharp && opts.resizeTo && (info.width > opts.resizeTo || info.height > opts.resizeTo || info.type !== 'webp')) {
      data = await sharp(input, { limitInputPixels: maxDim * maxDim })
        .rotate()
        .resize(opts.resizeTo, opts.resizeTo, { fit: 'cover' })
        .webp({ quality: 85 })
        .toBuffer();
      info = sniffImage(data) ?? info;
    }

    const sha = createHash('sha256').update(data).digest('hex');
    const now = this.clock.now();
    const d = new Date(now);
    const rel = `${opts.purpose}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${sha.slice(0, 24)}.${EXTENSION[info.type]}`;
    const abs = join(this.config.uploadsDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, data);

    return this.db.q
      .insertInto('files')
      .values({
        owner_user_id: opts.ownerUserId,
        purpose: opts.purpose,
        driver: 'local',
        path: rel,
        mime: info.mime,
        size: data.length,
        width: info.width,
        height: info.height,
        sha256: sha,
        created_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Dosya kaydını siler; aynı içeriği kullanan başka kayıt yoksa diskten de kaldırır. */
  async delete(fileId: number | null | undefined): Promise<void> {
    if (!fileId) return;
    const file = await this.db.q.selectFrom('files').selectAll().where('id', '=', fileId).executeTakeFirst();
    if (!file) return;
    await this.db.q.deleteFrom('files').where('id', '=', fileId).execute();
    const others = await this.db.q.selectFrom('files').select('id').where('path', '=', file.path).executeTakeFirst();
    if (!others) {
      this.db.afterCommit(() => {
        try {
          unlinkSync(join(this.config.uploadsDir, file.path));
        } catch {
          /* dosya zaten yok */
        }
      });
    }
  }

  async get(fileId: number | null | undefined): Promise<Row<'files'> | undefined> {
    if (!fileId) return undefined;
    return this.db.q.selectFrom('files').selectAll().where('id', '=', fileId).executeTakeFirst();
  }
}
