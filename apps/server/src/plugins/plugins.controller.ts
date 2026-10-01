import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { PLUGIN_KEYS, PLUGINS, type AdminPlugin, type Locale, type PluginKey, type TParams } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { SettingsService } from '../settings/settings.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Db } from '../database/db.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { AppearanceService } from '../appearance/appearance.service.js';
import { I18nService } from '../i18n/i18n.service.js';
import { ShoutboxService } from '../shoutbox/shoutbox.service.js';
import { DiscordService } from '../discord/discord.service.js';
import { HomeService } from '../home/home.service.js';

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
    private readonly i18n: I18nService,
    private readonly shoutbox: ShoutboxService,
    private readonly discord: DiscordService,
    private readonly home: HomeService,
  ) {}

  private async stats(key: PluginKey, locale: Locale): Promise<string[]> {
    const count = async (q: Promise<{ n: number | string | bigint } | undefined>) => Number((await q)?.n ?? 0);
    const tr = (text: string, params?: TParams) => this.i18n.t(locale, text, params);
    switch (key) {
      case 'landing': {
        const slug = this.settings.get('home.landingPage');
        return [slug ? tr('Ana sayfa: /pages/{slug}', { slug }) : tr('Açılış sayfası seçilmedi')];
      }
      case 'wiki': {
        const n = await count(this.db.q.selectFrom('wiki_pages').select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst());
        return [tr('{n, plural, other {# sayfa}}', { n })];
      }
      case 'applications': {
        const forms = await count(this.db.q.selectFrom('application_forms').select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst());
        const pending = await count(this.db.q.selectFrom('applications').select((eb) => eb.fn.countAll<number>().as('n')).where('status', 'in', ['pending', 'reviewing']).executeTakeFirst());
        return [tr('{n, plural, other {# form}}', { n: forms }), tr('{n, plural, other {# bekleyen başvuru}}', { n: pending })];
      }
      case 'tickets': {
        const open = await count(this.db.q.selectFrom('tickets').select((eb) => eb.fn.countAll<number>().as('n')).where('status', '!=', 'closed').executeTakeFirst());
        const cats = await count(this.db.q.selectFrom('ticket_categories').select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst());
        return [tr('{n, plural, other {# kategori}}', { n: cats }), tr('{n, plural, other {# açık talep}}', { n: open })];
      }
      case 'shoutbox': {
        const s = await this.shoutbox.stats();
        return [tr('{n, plural, other {# mesaj}}', { n: s.total }), tr('Son 24 saatte {n}', { n: s.today })];
      }
      case 'discord': {
        const c = this.discord.adminView();
        return [c.hasWebhook ? tr('Webhook bağlı') : tr('Webhook ayarlı değil'), c.guildId ? tr('Sunucu widget\'ı açık') : tr('Widget ayarlı değil')];
      }
    }
  }

  @Get()
  @AdminEndpoint('admin.settings')
  async list(@CurrentViewer() v: RequestViewer): Promise<{ items: AdminPlugin[] }> {
    const locale = v.locale ?? this.i18n.defaultLocale();
    return { items: await Promise.all(PLUGINS.map(async (p) => ({ ...p, enabled: this.settings.plugin(p.key), stats: await this.stats(p.key, locale) }))) };
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
    // Bloğu olan eklentiler açılınca ana sayfaya (yoksa) eklenir
    const block = ({ shoutbox: 'top', discord: 'sidebar' } as const)[key as 'shoutbox'];
    if (block && body.enabled) await this.home.ensureBlock(key as 'shoutbox', block, v.user!.id);
    await this.audit.log({ type: 'admin', action: body.enabled ? 'plugin.enable' : 'plugin.disable', actorId: v.user!.id, ip: v.ip, data: { key } });
    return { ok: true };
  }
}
