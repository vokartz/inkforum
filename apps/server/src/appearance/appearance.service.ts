import { Injectable } from '@nestjs/common';
import {
  APPEARANCE_RESET_PARTS,
  BRANDING_ASSETS,
  NAV_BUILTINS,
  PERMISSION_MAP,
  SETTING_KEYS,
  SETTINGS,
  pluginEnabled,
  type AppearanceResetPart,
  type AdminNavItem,
  type BrandingAsset,
  type NavBuiltinKey,
  type NavEntry,
  type NavTreeInput,
  type SettingKey,
} from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { CacheService } from '../cache/cache.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { StorageService } from '../storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { I18nService } from '../i18n/i18n.service.js';
import { iconExists, iconNode } from '../common/icons.js';
import { can, type RequestViewer } from '../common/request-context.js';

const NS = 'nav';
type NavRow = Row<'nav_items'>;
type NavInput = Omit<NavTreeInput['items'][number], 'children'>;

/** Varsayılan menü (ilk açılışta bir kez). */
const DEFAULT_NAV: Array<{ builtin?: NavBuiltinKey; label?: string; url?: string; icon?: string }> = [
  { builtin: 'forum' },
  { builtin: 'unread' },
  { builtin: 'members' },
  { builtin: 'groups' },
  { builtin: 'achievements' },
  { builtin: 'online' },
  { builtin: 'wiki' },
  { label: 'Kurallar', url: '/policies/rules', icon: 'book-open-text' },
];

@Injectable()
export class AppearanceService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly cache: CacheService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly i18n: I18nService,
  ) {}

  // ---------- Menü ----------

  private rows(): Promise<NavRow[]> {
    return this.cache.wrap(NS, 'rows', () => this.db.q.selectFrom('nav_items').selectAll().orderBy('sort_order').orderBy('id').execute());
  }

  /** Eklenti açılınca sistem menü öğesi yoksa üst menünün sonuna eklenir */
  async ensureBuiltin(key: NavBuiltinKey): Promise<void> {
    const exists = await this.db.q.selectFrom('nav_items').select('id').where('builtin_key', '=', key).executeTakeFirst();
    if (exists) return;
    const b = NAV_BUILTINS[key];
    const last = await this.db.q.selectFrom('nav_items').select((eb) => eb.fn.max('sort_order').as('m')).where('parent_id', 'is', null).executeTakeFirst();
    const now = this.clock.now();
    await this.db.q
      .insertInto('nav_items')
      .values({ kind: 'builtin', builtin_key: key, label: b.label, url: null, icon: b.icon, visibility: b.visibility, sort_order: Number(last?.m ?? 0) + 1, created_at: now, updated_at: now })
      .execute();
    await this.cache.invalidate(NS);
  }

  async seedDefaults(): Promise<void> {
    const any = await this.db.q.selectFrom('nav_items').select('id').executeTakeFirst();
    if (any) return;
    const now = this.clock.now();
    for (const [i, d] of DEFAULT_NAV.entries()) {
      const b = d.builtin ? NAV_BUILTINS[d.builtin] : null;
      await this.db.q
        .insertInto('nav_items')
        .values({
          kind: b ? 'builtin' : 'link',
          builtin_key: d.builtin ?? null,
          label: b?.label ?? d.label!,
          url: b ? null : d.url!,
          icon: b?.icon ?? d.icon ?? null,
          visibility: b?.visibility ?? 'all',
          sort_order: i,
          created_at: now,
          updated_at: now,
        })
        .execute();
    }
    await this.cache.invalidate(NS);
  }

  private visible(row: NavRow, viewer: RequestViewer): boolean {
    if (!row.is_enabled) return false;
    if (row.visibility === 'members' && !viewer.user) return false;
    if (row.visibility === 'guests' && viewer.user) return false;
    const builtin = row.builtin_key ? NAV_BUILTINS[row.builtin_key as NavBuiltinKey] : null;
    if (row.kind === 'builtin' && !builtin) return false;
    const perm = row.permission ?? builtin?.permission ?? null;
    if (perm && !can(viewer, perm)) return false;
    if (row.builtin_key === 'achievements' && !this.settings.get('achievements.enabled')) return false;
    if (row.builtin_key === 'wiki' && !this.settings.get('wiki.enabled') && !can(viewer, 'wiki.edit')) return false;
    // Kapalı eklentilerin menü öğeleri gizlenir
    const plugin = ({ wiki: 'wiki', applications: 'applications', tickets: 'tickets', home: 'landing' } as const)[row.builtin_key as 'wiki'];
    if (plugin && !this.settings.plugin(plugin)) return false;
    // "Ana sayfa" yalnızca ayrı bir açılış sayfası varken anlamlı
    if (row.builtin_key === 'home' && !this.settings.landing()) return false;
    return true;
  }

  private href(row: NavRow): string | null {
    if (row.kind === 'dropdown') return null;
    if (row.builtin_key === 'forum' && this.settings.landing()) return '/forum';
    if (row.kind === 'builtin') return NAV_BUILTINS[row.builtin_key as NavBuiltinKey]?.url ?? null;
    return row.url;
  }

  /** Ziyaretçiye göre filtrelenmiş menü. */
  async nav(viewer: RequestViewer): Promise<NavEntry[]> {
    const rows = await this.rows();
    // Varsayılan (Türkçe) menü adları ziyaretçinin diline çevrilir; yöneticinin yazdığı özel adlar olduğu gibi kalır
    const locale = viewer.locale ?? this.i18n.defaultLocale();
    const toEntry = (r: NavRow): NavEntry => ({
      id: r.id,
      label: this.i18n.t(locale, r.label),
      href: this.href(r),
      icon: iconNode(r.icon, 'bold'),
      newTab: r.new_tab === 1,
      style: r.style === 'button' ? 'button' : 'link',
      children: rows.filter((c) => c.parent_id === r.id && this.visible(c, viewer)).map(toEntry),
    });
    return rows
      .filter((r) => !r.parent_id && this.visible(r, viewer))
      .map(toEntry)
      .filter((e) => e.href || e.children.length);
  }

  async adminItems(): Promise<AdminNavItem[]> {
    return (await this.rows()).map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      kind: r.kind,
      builtinKey: r.builtin_key,
      label: r.label,
      url: r.url,
      icon: r.icon,
      iconNodes: iconNode(r.icon, 'bold'),
      newTab: r.new_tab === 1,
      visibility: r.visibility,
      permission: r.permission,
      isEnabled: r.is_enabled === 1,
      style: r.style === 'button' ? 'button' : 'link',
    }));
  }

  /** Menüyü tamamen yeniden yazar (sıra gönderilen diziye göre). */
  async saveNav(viewer: RequestViewer, input: NavTreeInput): Promise<void> {
    const fields: Record<string, string> = {};
    const check = (it: NavInput, path: string) => {
      if (it.kind === 'builtin' && !(it.builtinKey && it.builtinKey in NAV_BUILTINS)) fields[path] = 'Bilinmeyen sistem öğesi.';
      if (it.kind === 'link' && !(it.url && /^(https?:\/\/|\/|mailto:)/i.test(it.url))) fields[path] = `"${it.label}": adres http(s)://, / ya da mailto: ile başlamalı.`;
      if (it.permission && !PERMISSION_MAP.has(it.permission)) fields[path] = `"${it.label}": bilinmeyen yetki.`;
      if (it.icon && !iconExists(it.icon)) fields[path] = `"${it.label}": ikon bulunamadı.`;
    };
    input.items.forEach((it, i) => {
      check(it, `items.${i}`);
      if (it.kind !== 'dropdown' && it.children.length) fields[`items.${i}`] = `"${it.label}": alt öğeler yalnızca açılır menüde olabilir.`;
      it.children.forEach((c, k) => {
        check(c, `items.${i}.children.${k}`);
        if (c.kind === 'dropdown') fields[`items.${i}.children.${k}`] = 'Açılır menü iç içe olamaz.';
      });
    });
    if (Object.keys(fields).length) throw Errors.validation(fields, Object.values(fields)[0]);
    const now = this.clock.now();
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('nav_items').execute();
      let order = 0;
      const insert = async (it: NavInput, parentId: number | null) => {
        const row = await this.db.q
          .insertInto('nav_items')
          .values({
            parent_id: parentId,
            kind: it.kind,
            builtin_key: it.kind === 'builtin' ? it.builtinKey : null,
            label: it.label,
            url: it.kind === 'link' ? it.url : null,
            icon: it.icon,
            new_tab: it.newTab,
            visibility: it.visibility,
            permission: it.permission,
            is_enabled: it.isEnabled,
            style: it.style,
            sort_order: order++,
            created_at: now,
            updated_at: now,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        return row.id;
      };
      for (const it of input.items) {
        const id = await insert(it, null);
        for (const c of it.children) await insert(c, id);
      }
    });
    await this.cache.invalidate(NS);
    await this.audit.log({ type: 'admin', action: 'appearance.nav', actorId: viewer.user!.id, ip: viewer.ip });
  }

  // ---------- Marka görselleri ----------

  private async deleteByUrl(url: string | null): Promise<void> {
    if (!url?.startsWith('/uploads/')) return;
    const file = await this.db.q.selectFrom('files').select('id').where('path', '=', url.slice('/uploads/'.length)).executeTakeFirst();
    if (file) await this.storage.delete(file.id);
  }

  async uploadAsset(viewer: RequestViewer, kind: BrandingAsset, buffer: Buffer): Promise<{ url: string }> {
    const def = BRANDING_ASSETS[kind];
    if (!def) throw Errors.notFound();
    const key = def.setting as SettingKey;
    const previous = this.settings.get(key) as string | null;
    const saved = await this.storage.saveImage(buffer, {
      purpose: 'branding',
      ownerUserId: viewer.user!.id,
      maxBytes: def.maxKb * 1024,
      maxDimension: kind === 'banner' || kind === 'background' || kind === 'footer' || kind === 'auth' ? 6000 : 2048,
      resizeTo: kind === 'favicon' ? 128 : kind === 'defaultAvatar' ? 256 : undefined,
    });
    const url = this.storage.publicUrl(saved)!;
    await this.settings.set(key, url as never, viewer.user!.id);
    await this.deleteByUrl(previous);
    await this.audit.log({ type: 'admin', action: `appearance.${kind}`, actorId: viewer.user!.id, ip: viewer.ip });
    return { url };
  }

  /** Görünümü (seçilen bölümleri) varsayılana döndürür. */
  async reset(viewer: RequestViewer, parts: AppearanceResetPart[]): Promise<void> {
    const want = new Set(parts.length ? parts : APPEARANCE_RESET_PARTS);
    const assetKeys = new Set<string>(Object.values(BRANDING_ASSETS).map((d) => d.setting));
    const linkKeys = new Set<string>(['appearance.socialLinks', 'appearance.footerLinks', 'appearance.footerText']);
    const defaults: Record<string, unknown> = {};
    for (const key of SETTING_KEYS) {
      const k = key as string;
      if (want.has('theme') && k.startsWith('appearance.') && !assetKeys.has(k) && !linkKeys.has(k)) defaults[k] = SETTINGS[key].default;
      if (want.has('footer') && linkKeys.has(k)) defaults[k] = SETTINGS[key].default;
      if (want.has('css') && k === 'custom.css') defaults[k] = SETTINGS[key].default;
    }
    if (Object.keys(defaults).length) await this.settings.update(defaults, viewer.user!.id, { allowHidden: true });
    if (want.has('branding')) {
      // Yüklenen dosyalar silinir, ayarlar varsayılana (InkForum logosu / simgesi ya da boş) döner
      for (const kind of Object.keys(BRANDING_ASSETS) as BrandingAsset[]) {
        const key = BRANDING_ASSETS[kind].setting as SettingKey;
        const current = this.settings.get(key) as string | null;
        await this.settings.set(key, SETTINGS[key].default as never, viewer.user!.id);
        if (current !== SETTINGS[key].default) await this.deleteByUrl(current);
      }
    }
    if (want.has('nav')) {
      await this.db.q.deleteFrom('nav_items').execute();
      await this.cache.invalidate(NS);
      await this.seedDefaults();
      const all = this.settings.all() as Record<string, unknown>;
      for (const key of ['applications', 'tickets'] as const) if (pluginEnabled(all, key)) await this.ensureBuiltin(key);
    }
    await this.audit.log({ type: 'admin', action: 'appearance.reset', actorId: viewer.user!.id, ip: viewer.ip, data: { parts: [...want] } });
  }

  async removeAsset(viewer: RequestViewer, kind: BrandingAsset): Promise<void> {
    const def = BRANDING_ASSETS[kind];
    if (!def) throw Errors.notFound();
    const key = def.setting as SettingKey;
    const previous = this.settings.get(key) as string | null;
    await this.settings.set(key, null as never, viewer.user!.id);
    await this.deleteByUrl(previous);
    await this.audit.log({ type: 'admin', action: `appearance.${kind}.remove`, actorId: viewer.user!.id, ip: viewer.ip });
  }
}
