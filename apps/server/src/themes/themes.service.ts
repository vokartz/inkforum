import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  activeThemeOf,
  type ActiveTheme,
  THEME_HTML_SLOTS,
  THEME_PRESETS,
  themeConfigSchema,
  themeSettingValues,
  type ThemeConfig,
  type ThemeDetail,
  type ThemeHtmlSlot,
  type ThemeInput,
  type ThemeSummary,
} from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { can, type RequestViewer } from '../common/request-context.js';
import { SettingsService } from '../settings/settings.service.js';
import { AuditService } from '../audit/audit.service.js';

const EMPTY_HTML = () =>
  Object.fromEntries(THEME_HTML_SLOTS.map((k) => [k, ''])) as Record<ThemeHtmlSlot, string>;

@Injectable()
export class ThemesService implements OnModuleInit {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureSystem();
      await this.refreshActive();
    } catch {
    }
  }

  private async refreshActive(): Promise<void> {
    const active = this.settings.get('appearance.theme') as ActiveTheme | null;
    if (!active?.id) return;
    const t = await this.get(active.id).catch(() => null);
    if (!t) return;
    const next = activeThemeOf(t);
    if (JSON.stringify(next) !== JSON.stringify(active)) await this.settings.update({ 'appearance.theme': next }, null, { allowHidden: true });
  }

  async ensureSystem(): Promise<void> {
    const any = await this.db.q
      .selectFrom('themes')
      .select('id')
      .where('is_system', '=', 1)
      .executeTakeFirst();
    if (any) return;
    const now = this.clock.now();
    const style = String(this.settings.get('appearance.themeStyle') ?? 'modern');
    const current = {
      accent: String(this.settings.get('appearance.accentColor') ?? '#7b61ff'),
      mode: { default: (this.settings.get('appearance.defaultMode') ?? 'dark') as 'dark', toggle: true },
      typography: { font: this.settings.get('appearance.fontFamily') as never },
      layout: { postLayout: this.settings.get('appearance.postLayout') as never },
    };
    let activeId: number | null = null;
    for (const key of ['modern', 'community'] as const) {
      const preset = THEME_PRESETS.find((p) => p.key === key)!;
      const config = themeConfigSchema.parse({ ...preset.config, ...(style === key ? current : {}) });
      const row = await this.db.q
        .insertInto('themes')
        .values({
          name: preset.name,
          description: preset.description,
          is_system: 1,
          preset: key,
          config_json: JSON.stringify(config),
          created_at: now,
          updated_at: now,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      if (key === style) activeId = row.id;
    }
    await this.settings.update({ 'appearance.themeId': activeId }, null, { allowHidden: true });
  }

  private parse(r: Row<'themes'>): ThemeDetail {
    let config: ThemeConfig;
    try {
      config = themeConfigSchema.parse(JSON.parse(r.config_json));
    } catch {
      config = themeConfigSchema.parse({});
    }
    let html = EMPTY_HTML();
    try {
      html = { ...html, ...(JSON.parse(r.html_json) as Partial<Record<ThemeHtmlSlot, string>>) };
    } catch {
    }
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.is_system === 1,
      active: this.settings.get('appearance.themeId') === r.id,
      config,
      css: r.css,
      html,
      updatedAt: r.updated_at,
    };
  }

  async list(): Promise<ThemeSummary[]> {
    await this.ensureSystem();
    const rows = await this.db.q
      .selectFrom('themes')
      .selectAll()
      .orderBy('is_system', 'desc')
      .orderBy('id')
      .execute();
    return rows.map((r) => {
      const { css: _c, html: _h, ...rest } = this.parse(r);
      return rest;
    });
  }

  async get(id: number): Promise<ThemeDetail> {
    const r = await this.db.q.selectFrom('themes').selectAll().where('id', '=', id).executeTakeFirst();
    if (!r) throw Errors.notFound('Tema bulunamadı.');
    return this.parse(r);
  }

  private codeAllowed(viewer: RequestViewer): boolean {
    return viewer.isAdmin || can(viewer, 'admin.customCode');
  }

  async create(
    viewer: RequestViewer,
    input: { name: string; preset?: string | null; copyOf?: number | null; data?: ThemeInput | null },
  ): Promise<{ id: number }> {
    let config: ThemeConfig;
    let css = '';
    let html = EMPTY_HTML();
    let description: string;
    if (input.copyOf) {
      const src = await this.get(input.copyOf);
      ({ config, css, html, description } = src);
    } else if (input.data) {
      config = input.data.config;
      description = input.data.description;
      if (this.codeAllowed(viewer)) ({ css, html } = input.data);
    } else {
      const preset = THEME_PRESETS.find((p) => p.key === (input.preset ?? 'modern')) ?? THEME_PRESETS[0]!;
      config = themeConfigSchema.parse(preset.config);
      description = preset.description;
    }
    const now = this.clock.now();
    const row = await this.db.q
      .insertInto('themes')
      .values({
        name: input.name,
        description,
        preset: input.preset ?? null,
        config_json: JSON.stringify(config),
        css,
        html_json: JSON.stringify(html),
        created_by: viewer.user!.id,
        created_at: now,
        updated_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.audit.log({
      type: 'admin',
      action: 'theme.create',
      actorId: viewer.user!.id,
      ip: viewer.ip,
      targetType: 'theme',
      targetId: row.id,
      data: { name: input.name },
    });
    return { id: row.id };
  }

  async update(viewer: RequestViewer, id: number, input: ThemeInput): Promise<ThemeDetail> {
    const prev = await this.get(id);
    const code = this.codeAllowed(viewer);
    await this.db.q
      .updateTable('themes')
      .set({
        name: input.name,
        description: input.description,
        config_json: JSON.stringify(input.config),
        css: code ? input.css : prev.css,
        html_json: JSON.stringify(code ? input.html : prev.html),
        updated_at: this.clock.now(),
      })
      .where('id', '=', id)
      .execute();
    await this.audit.log({
      type: 'admin',
      action: 'theme.update',
      actorId: viewer.user!.id,
      ip: viewer.ip,
      targetType: 'theme',
      targetId: id,
      data: { name: input.name },
    });
    const next = await this.get(id);
    if (next.active) await this.apply(next, viewer.user!.id);
    return next;
  }

  async activate(viewer: RequestViewer, id: number): Promise<void> {
    const t = await this.get(id);
    await this.settings.update({ 'appearance.themeId': id }, viewer.user!.id, { allowHidden: true });
    await this.apply(t, viewer.user!.id);
    await this.audit.log({
      type: 'admin',
      action: 'theme.activate',
      actorId: viewer.user!.id,
      ip: viewer.ip,
      targetType: 'theme',
      targetId: id,
      data: { name: t.name },
    });
  }

  private async apply(t: ThemeDetail, actorId: number): Promise<void> {
    await this.settings.update(
      { ...themeSettingValues(t.config), 'appearance.theme': activeThemeOf(t) },
      actorId,
      { allowHidden: true },
    );
  }

  async remove(viewer: RequestViewer, id: number): Promise<void> {
    const t = await this.get(id);
    if (t.isSystem)
      throw Errors.badRequest('Sistem temaları silinemez; isterseniz varsayılana döndürebilirsiniz.');
    if (t.active) throw Errors.badRequest('Etkin tema silinemez. Önce başka bir temayı etkinleştirin.');
    await this.db.q.deleteFrom('themes').where('id', '=', id).execute();
    await this.audit.log({
      type: 'admin',
      action: 'theme.delete',
      actorId: viewer.user!.id,
      ip: viewer.ip,
      targetType: 'theme',
      targetId: id,
      data: { name: t.name },
    });
  }

  async reset(viewer: RequestViewer, id: number): Promise<ThemeDetail> {
    const r = await this.db.q.selectFrom('themes').select(['preset']).where('id', '=', id).executeTakeFirst();
    const preset = THEME_PRESETS.find((p) => p.key === r?.preset);
    if (!preset) throw Errors.badRequest('Bu tema hazır bir temadan oluşturulmadığı için varsayılanı yok.');
    const cur = await this.get(id);
    return this.update(viewer, id, {
      name: cur.name,
      description: preset.description,
      config: themeConfigSchema.parse(preset.config),
      css: '',
      html: EMPTY_HTML(),
    });
  }
}
