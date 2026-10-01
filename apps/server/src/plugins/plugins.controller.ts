import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { PLUGIN_KEYS, PLUGINS, type AdminPlugin, type PluginKey } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { SettingsService } from '../settings/settings.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Db } from '../database/db.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { AppearanceService } from '../appearance/appearance.service.js';

// eslint-disable-next-line no-useless-assignment -- dekoratörde (@Param) kullanılıyor
const keyParam = z.enum(PLUGIN_KEYS);
const toggleSchema = z.object({ enabled: z.boolean() });

/** Yönetim → Eklentiler: yerleşik eklentileri açma / kapatma */
@Controller('admin/plugins')
export class PluginsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly db: Db,
    private readonly tickets: TicketsService,
    private readonly appearance: AppearanceService,
  ) {}

  private async stats(key: PluginKey): Promise<string[]> {
    const count = async (q: Promise<{ n: number | string | bigint } | undefined>) => Number((await q)?.n ?? 0);
    switch (key) {
      case 'landing': {
        const slug = this.settings.get('home.landingPage');
        return [slug ? `Ana sayfa: /pages/${slug}` : 'Açılış sayfası seçilmedi'];
      }
      case 'wiki':
        return [`${await count(this.db.q.selectFrom('wiki_pages').select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst())} sayfa`];
      case 'applications': {
        const forms = await count(this.db.q.selectFrom('application_forms').select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst());
        const pending = await count(this.db.q.selectFrom('applications').select((eb) => eb.fn.countAll<number>().as('n')).where('status', 'in', ['pending', 'reviewing']).executeTakeFirst());
        return [`${forms} form`, `${pending} bekleyen başvuru`];
      }
      case 'tickets': {
        const open = await count(this.db.q.selectFrom('tickets').select((eb) => eb.fn.countAll<number>().as('n')).where('status', '!=', 'closed').executeTakeFirst());
        const cats = await count(this.db.q.selectFrom('ticket_categories').select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst());
        return [`${cats} kategori`, `${open} açık talep`];
      }
    }
  }

  @Get()
  @AdminEndpoint('admin.settings')
  async list(): Promise<{ items: AdminPlugin[] }> {
    return { items: await Promise.all(PLUGINS.map(async (p) => ({ ...p, enabled: this.settings.plugin(p.key), stats: await this.stats(p.key) }))) };
  }

  @Put(':key')
  @AdminEndpoint('admin.settings')
  async toggle(@Param('key', new ZodPipe(keyParam)) key: PluginKey, @Body(new ZodPipe(toggleSchema)) body: z.output<typeof toggleSchema>, @CurrentViewer() v: RequestViewer) {
    const next = { ...this.settings.get('plugins.enabled'), [key]: body.enabled };
    await this.settings.update({ 'plugins.enabled': next }, v.user!.id, { allowHidden: true });
    // İlk açılışta varsayılan destek kategorileri oluşturulur
    if (key === 'tickets' && body.enabled) await this.tickets.ensureDefaults(v.user!.id);
    // Menüde yoksa eklentinin sayfası üst menüye eklenir
    const nav = ({ wiki: 'wiki', applications: 'applications', tickets: 'tickets' } as const)[key as 'wiki'];
    if (nav && body.enabled) await this.appearance.ensureBuiltin(nav);
    await this.audit.log({ type: 'admin', action: body.enabled ? 'plugin.enable' : 'plugin.disable', actorId: v.user!.id, ip: v.ip, data: { key } });
    return { ok: true };
  }
}
