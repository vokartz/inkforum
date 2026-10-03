import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { EMBED_PROVIDERS, SETTINGS, customProviderIssue, resolveEmbed } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PostRenderService } from './post-render.service.js';

const customSchema = SETTINGS['embeds.custom'].schema;

const embedsSchema = z.object({
  enabled: z.boolean(),
  autoEmbed: z.boolean(),
  clickToLoad: z.boolean(),
  disabledProviders: z.array(z.string().max(40)).max(100),
  custom: customSchema,
});

const testSchema = z.object({
  url: z.string().trim().min(4).max(2000),
  disabledProviders: z.array(z.string().max(40)).max(100).default([]),
  custom: customSchema.default([]),
  clickToLoad: z.boolean().default(false),
});

@Controller('admin/embeds')
export class AdminEmbedsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly render: PostRenderService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @AdminEndpoint('admin.settings')
  get() {
    return {
      providers: EMBED_PROVIDERS,
      enabled: this.settings.get('embeds.enabled'),
      autoEmbed: this.settings.get('embeds.autoEmbed'),
      clickToLoad: this.settings.get('embeds.clickToLoad'),
      disabledProviders: this.settings.get('embeds.disabledProviders'),
      custom: this.settings.get('embeds.custom'),
    };
  }

  @Put()
  @AdminEndpoint('admin.settings')
  async save(@Body(new ZodPipe(embedsSchema)) body: z.output<typeof embedsSchema>, @CurrentViewer() v: RequestViewer) {
    const fields: Record<string, string> = {};
    const keys = new Set<string>();
    body.custom.forEach((c, i) => {
      const issue = customProviderIssue(c);
      if (issue) fields[`custom.${i}`] = `${c.name}: ${issue}`;
      if (keys.has(c.key)) fields[`custom.${i}`] = `${c.name}: anahtar tekrar ediyor.`;
      keys.add(c.key);
    });
    if (Object.keys(fields).length) throw Errors.validation(fields, 'Özel sağlayıcılarda hata var.');
    const changed = await this.settings.update(
      {
        'embeds.enabled': body.enabled,
        'embeds.autoEmbed': body.autoEmbed,
        'embeds.clickToLoad': body.clickToLoad,
        'embeds.disabledProviders': body.disabledProviders,
        'embeds.custom': body.custom,
      },
      v.user!.id,
      { allowHidden: true },
    );
    if (changed.length) {
      await this.render.invalidateAll();
      await this.audit.log({ type: 'admin', action: 'embeds.update', actorId: v.user!.id, ip: v.ip, data: { changed } });
    }
    return { ok: true, changed };
  }

  @Post('test')
  @HttpCode(200)
  @AdminEndpoint('admin.settings')
  test(@Body(new ZodPipe(testSchema)) body: z.output<typeof testSchema>) {
    const embeds = { host: this.render.embedOptions().host, disabled: body.disabledProviders, custom: body.custom };
    const match = resolveEmbed(body.url, embeds);
    const html = match ? this.render.post(`[media]${body.url.replace(/\[/g, '%5B')}[/media]`, embeds).html : '';
    return { match: match ? { provider: match.provider, name: match.name, kind: match.kind, src: match.src } : null, html };
  }
}
