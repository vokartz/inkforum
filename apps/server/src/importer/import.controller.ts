import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { z } from 'zod';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint, RateLimit } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { I18nService } from '../i18n/i18n.service.js';
import { DEFAULT_OPTIONS, ImportService } from './import.service.js';

const charset = z.enum(['utf8', 'windows-1254', 'windows-1252']);

const startInput = z.object({
  charset,
  fixMojibake: z.boolean().default(false),
  baseUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === '' || /^https?:\/\/[^\s/]+/i.test(v), { message: 'Eski forumun adresi http:// veya https:// ile başlamalı.' })
    .default(''),
  clearForum: z.boolean().default(DEFAULT_OPTIONS.clearForum),
  replaceRanks: z.boolean().default(DEFAULT_OPTIONS.replaceRanks),
  include: z
    .object({ polls: z.boolean(), conversations: z.boolean(), bans: z.boolean() })
    .default(DEFAULT_OPTIONS.include),
  files: z
    .object({ avatars: z.boolean(), groupIcons: z.boolean(), attachmentImages: z.boolean() })
    .default(DEFAULT_OPTIONS.files),
  confirm: z.literal(true, { error: 'Aktarmayı onaylayın.' }),
});

const previewQuery = z.object({ charset, fix: z.enum(['0', '1']).default('0') });
const legacyQuery = z.object({ kind: z.enum(['topic', 'post', 'board', 'user']), id: z.string().regex(/^\d{1,12}$/) });

/** Yüklenen dökümler önce geçici klasöre yazılır; klasör servis üzerinden belirlenir */
let incoming: () => string = () => '.';

@Controller()
export class ImportController {
  constructor(
    private readonly imports: ImportService,
    private readonly audit: AuditService,
    private readonly i18n: I18nService,
  ) {
    incoming = () => imports.incomingDir();
  }

  /** Günlük satırları ve hata sunucuda Türkçe üretilir; yöneticinin diline çevrilir */
  private localize<T extends { log: Array<{ msg: string }>; error: string | null }>(r: T, v: RequestViewer): T {
    const locale = v.locale ?? 'tr';
    if (locale === 'tr') return r;
    return { ...r, error: r.error ? this.i18n.message(locale, r.error) : null, log: r.log.map((l) => ({ ...l, msg: this.i18n.message(locale, l.msg) })) };
  }

  @Get('admin/import')
  @AdminEndpoint('admin.maintenance')
  async list(@CurrentViewer() v: RequestViewer) {
    return { busy: this.imports.busy(), runs: (await this.imports.list()).map((r) => this.localize(r, v)) };
  }

  @Get('admin/import/:id')
  @AdminEndpoint('admin.maintenance')
  async get(@Param('id', ParseIntPipe) id: number, @CurrentViewer() v: RequestViewer) {
    return this.localize(await this.imports.get(id), v);
  }

  @Post('admin/import/upload')
  @HttpCode(201)
  @AdminEndpoint('admin.maintenance')
  @RateLimit({ limit: 20, windowMs: 10 * MINUTE, by: 'user' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: (_req, _file, cb) => cb(null, incoming()), filename: (_req, _file, cb) => cb(null, `up-${Date.now()}-${Math.random().toString(36).slice(2)}`) }),
      limits: { fileSize: 8 * 1024 ** 3, files: 1, fields: 2 },
    }),
  )
  async upload(@UploadedFile() file: { path: string; originalname: string; size: number } | undefined, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir veritabanı dökümü (.sql veya .sql.gz) seçin.');
    const id = await this.imports.adoptUpload(file.path, file.originalname, file.size, v.user!.id);
    await this.audit.log({ type: 'admin', action: 'import.upload', actorId: v.user!.id, ip: v.ip, data: { id, name: file.originalname, size: file.size } });
    return { id };
  }

  @Get('admin/import/:id/preview')
  @AdminEndpoint('admin.maintenance')
  async preview(@Param('id', ParseIntPipe) id: number, @Query(new ZodPipe(previewQuery)) q: z.output<typeof previewQuery>) {
    return { samples: await this.imports.preview(id, q.charset, q.fix === '1') };
  }

  @Post('admin/import/:id/start')
  @HttpCode(202)
  @AdminEndpoint('admin.maintenance')
  @RateLimit({ limit: 20, windowMs: 10 * MINUTE, by: 'user' })
  async start(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(startInput)) body: z.output<typeof startInput>, @CurrentViewer() v: RequestViewer) {
    const { confirm: _confirm, ...options } = body;
    await this.imports.start(id, options, v.user!.id);
    await this.audit.log({ type: 'admin', action: 'import.start', actorId: v.user!.id, ip: v.ip, data: { id, options } });
    return { ok: true };
  }

  @Post('admin/import/:id/cancel')
  @AdminEndpoint('admin.maintenance')
  cancel(@Param('id', ParseIntPipe) id: number) {
    this.imports.cancel(id);
    return { ok: true };
  }

  @Delete('admin/import/:id')
  @AdminEndpoint('admin.maintenance')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentViewer() v: RequestViewer) {
    await this.imports.remove(id);
    await this.audit.log({ type: 'admin', action: 'import.delete', actorId: v.user!.id, ip: v.ip, data: { id } });
    return { ok: true };
  }

  /** Eski forum adresleri için yönlendirme hedefi (herkese açık; yalnızca yeni kimliği verir) */
  @Get('import/legacy')
  async legacy(@Query(new ZodPipe(legacyQuery)) q: z.output<typeof legacyQuery>) {
    const id = await this.imports.redirect(q.kind, q.id);
    if (!id) throw new NotFoundException();
    const path = q.kind === 'topic' ? `/t/${id}` : q.kind === 'post' ? `/p/${id}` : q.kind === 'board' ? `/f/${id}` : `/u/${id}`;
    return { url: path };
  }
}
