import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint, RateLimit } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { CONFIG, type AppConfig } from '../config/config.js';
import { SettingsService } from '../settings/settings.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BackupService } from './backup.service.js';

const nameParam = z.string().max(120);
const kindSchema = z.object({ kind: z.enum(['db', 'sql', 'full']).default('db') });
const settingsInput = z.object({
  autoBackup: z.boolean(),
  keep: z.number().int().min(1).max(60),
  hour: z.number().int().min(0).max(23),
  kind: z.enum(['db', 'sql', 'full']),
});
const restoreInput = z.object({ confirm: z.literal('GERİ YÜKLE', { error: 'Onaylamak için "GERİ YÜKLE" yazın.' }) });

let storageDir = '';
const incomingDir = () => {
  const dir = join(storageDir, 'backups', '.incoming');
  mkdirSync(dir, { recursive: true });
  return dir;
};

@Controller('admin/backups')
export class BackupsController {
  constructor(
    private readonly backups: BackupService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {
    storageDir = config.storageDir;
  }

  @Get()
  @AdminEndpoint('admin.maintenance')
  list() {
    const support = this.backups.supported();
    return {
      supported: support.ok,
      reason: support.reason,
      driver: this.config.db.driver,
      items: this.backups.list(),
      autoBackup: this.settings.get('maintenance.autoBackup'),
      keep: this.settings.get('maintenance.backupKeep'),
      hour: this.settings.get('maintenance.backupHour'),
      kind: this.settings.get('maintenance.backupKind'),
      lastRestore: this.backups.lastRestore(),
      restorePending: this.backups.restorePending(),
    };
  }

  @Post()
  @HttpCode(201)
  @AdminEndpoint('admin.maintenance')
  @RateLimit({ limit: 6, windowMs: 10 * MINUTE, by: 'user' })
  async create(@Body(new ZodPipe(kindSchema)) body: z.output<typeof kindSchema>, @CurrentViewer() v: RequestViewer) {
    const file = await this.backups.create(body.kind, 'manual');
    this.backups.prune(Math.max(this.settings.get('maintenance.backupKeep'), 3));
    await this.audit.log({ type: 'admin', action: 'backup.create', actorId: v.user!.id, ip: v.ip, data: { name: file.name, kind: body.kind } });
    return file;
  }

  @Post('upload')
  @HttpCode(201)
  @AdminEndpoint('admin.maintenance')
  @RateLimit({ limit: 5, windowMs: 10 * MINUTE, by: 'user' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: (_req, _file, cb) => cb(null, incomingDir()), filename: (_req, _file, cb) => cb(null, `up-${Date.now()}-${Math.random().toString(36).slice(2)}`) }),
      limits: { fileSize: 4 * 1024 ** 3, files: 1, fields: 2 },
    }),
  )
  async upload(@UploadedFile() file: { path: string; originalname: string; size: number } | undefined, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir yedek dosyası seçin.');
    const adopted = await this.backups.adoptUpload(file.path, file.originalname);
    await this.audit.log({ type: 'admin', action: 'backup.upload', actorId: v.user!.id, ip: v.ip, data: { name: adopted.name, size: file.size } });
    return adopted;
  }

  @Put('settings')
  @AdminEndpoint('admin.maintenance')
  async saveSettings(@Body(new ZodPipe(settingsInput)) body: z.output<typeof settingsInput>, @CurrentViewer() v: RequestViewer) {
    await this.settings.update(
      { 'maintenance.autoBackup': body.autoBackup, 'maintenance.backupKeep': body.keep, 'maintenance.backupHour': body.hour, 'maintenance.backupKind': body.kind },
      v.user!.id,
      { allowHidden: true },
    );
    return { ok: true };
  }

  @Post(':name/restore')
  @HttpCode(202)
  @AdminEndpoint('admin.maintenance')
  @RateLimit({ limit: 3, windowMs: 10 * MINUTE, by: 'user' })
  async restore(@Param('name', new ZodPipe(nameParam)) name: string, @Body(new ZodPipe(restoreInput)) _body: z.output<typeof restoreInput>, @CurrentViewer() v: RequestViewer) {
    await this.audit.log({ type: 'admin', action: 'backup.restore', actorId: v.user!.id, ip: v.ip, data: { name } });
    return this.backups.scheduleRestore(name, v.user!.id);
  }

  @Get(':name/download')
  @AdminEndpoint('admin.maintenance')
  async download(@Param('name', new ZodPipe(nameParam)) name: string, @CurrentViewer() v: RequestViewer, @Res() res: Response) {
    const stream = this.backups.stream(name);
    await this.audit.log({ type: 'admin', action: 'backup.download', actorId: v.user!.id, ip: v.ip, data: { name } });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    stream.pipe(res);
  }

  @Delete(':name')
  @AdminEndpoint('admin.maintenance')
  async remove(@Param('name', new ZodPipe(nameParam)) name: string, @CurrentViewer() v: RequestViewer) {
    this.backups.remove(name);
    await this.audit.log({ type: 'admin', action: 'backup.delete', actorId: v.user!.id, ip: v.ip, data: { name } });
    return { ok: true };
  }
}
