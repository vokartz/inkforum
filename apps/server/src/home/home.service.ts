import { Injectable } from '@nestjs/common';
import { HOME_BLOCK_KINDS, renderBBCode, type AdminHomeBlock, type HomeBlock, type HomeBlockInput, type HomeLayout, type HomeLayoutInput } from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { CacheService } from '../cache/cache.service.js';
import { StorageService } from '../storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PostRenderService } from '../forum/post-render.service.js';
import { iconExists, iconNode } from '../common/icons.js';
import type { UploadedImage } from '../common/upload.js';
import { SettingsService } from '../settings/settings.service.js';
import { can, type RequestViewer } from '../common/request-context.js';

const NS = 'home';
type BlockRow = Row<'home_blocks'>;

/** İlk kurulumda yan sütuna eklenen bileşenler (önceki sabit yerleşimle aynı). */
const DEFAULT_BLOCKS: Array<Pick<HomeBlockInput, 'kind' | 'position'>> = [
  { kind: 'recent', position: 'sidebar' },
  { kind: 'stats', position: 'sidebar' },
  { kind: 'online', position: 'sidebar' },
  { kind: 'birthdays', position: 'sidebar' },
];

function parseConfig(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Kartlardaki yüklenmiş görsel adresleri (silinen kartların dosyalarını temizlemek için). */
function imagesOf(kind: string, config: Record<string, unknown>): string[] {
  if (kind !== 'tiles') return [];
  const items = Array.isArray(config.items) ? (config.items as Array<{ image?: string | null }>) : [];
  return items.map((i) => i.image ?? '').filter((u) => u.startsWith('/uploads/'));
}

@Injectable()
export class HomeService {
  /** Oluşturulan HTML, blok güncellenene kadar saklanır. */
  private readonly rendered = new Map<string, string>();

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly render: PostRenderService,
    private readonly settings: SettingsService,
  ) {}

  private rows(): Promise<BlockRow[]> {
    return this.cache.wrap(NS, 'rows', () => this.db.q.selectFrom('home_blocks').selectAll().orderBy('sort_order').orderBy('id').execute());
  }

  /** Eklenti açılınca bloğu (yoksa) verilen konuma ekler */
  async ensureBlock(kind: 'discord', position: 'top' | 'sidebar' | 'bottom', actorId: number): Promise<void> {
    const exists = await this.db.q.selectFrom('home_blocks').select('id').where('kind', '=', kind).executeTakeFirst();
    if (exists) return;
    const last = await this.db.q.selectFrom('home_blocks').select((eb) => eb.fn.max('sort_order').as('m')).where('position', '=', position).executeTakeFirst();
    const now = this.clock.now();
    await this.db.q
      .insertInto('home_blocks')
      .values({ position, kind, config_json: '{}', sort_order: position === 'top' ? -1 : Number(last?.m ?? 0) + 1, created_at: now, updated_at: now })
      .execute();
    await this.cache.invalidate(NS);
    await this.audit.log({ type: 'admin', action: 'home.block.add', actorId, data: { kind } });
  }

  async seedDefaults(): Promise<void> {
    const any = await this.db.q.selectFrom('home_blocks').select('id').executeTakeFirst();
    if (any) return;
    const now = this.clock.now();
    for (const [i, b] of DEFAULT_BLOCKS.entries()) {
      await this.db.q
        .insertInto('home_blocks')
        .values({ position: b.position, kind: b.kind, config_json: b.kind === 'recent' ? '{"limit":5}' : '{}', sort_order: i, created_at: now, updated_at: now })
        .execute();
    }
    await this.cache.invalidate(NS);
  }

  private visible(r: BlockRow, viewer: RequestViewer, now: number): boolean {
    if (r.is_enabled !== 1) return false;
    if (r.visibility === 'members' && !viewer.user) return false;
    if (r.visibility === 'guests' && viewer.user) return false;
    if (r.starts_at && now < r.starts_at) return false;
    if (r.ends_at && now > r.ends_at) return false;
    return true;
  }

  private html(r: BlockRow, source: string, rich: boolean): string {
    const key = `${r.id}:${r.updated_at}:${rich ? 1 : 0}`;
    let out = this.rendered.get(key);
    if (out === undefined) {
      out = rich ? this.render.post(source).html : renderBBCode(source, { media: false, images: false, blocks: false, maxQuoteDepth: 0 }).html;
      if (this.rendered.size > 500) this.rendered.clear();
      this.rendered.set(key, out);
    }
    return out;
  }

  private toBlock(r: BlockRow): HomeBlock | null {
    const c = parseConfig(r.config_json);
    const base = { id: r.id, title: r.title };
    switch (r.kind) {
      case 'announcement':
        return {
          ...base,
          kind: 'announcement',
          key: `${r.id}:${r.updated_at}`,
          html: this.html(r, String(c.text ?? ''), false),
          style: (c.style as never) ?? 'accent',
          icon: iconNode((c.icon as string | null) ?? null, 'fill'),
          linkUrl: (c.linkUrl as string | null) ?? null,
          linkLabel: (c.linkLabel as string | null) ?? null,
          dismissible: c.dismissible !== false,
        };
      case 'tiles':
        return {
          ...base,
          kind: 'tiles',
          columns: Number(c.columns ?? 3),
          height: (c.height as 'sm' | 'md' | 'lg') ?? 'md',
          items: Array.isArray(c.items) ? (c.items as never) : [],
        };
      case 'text':
        return { ...base, kind: 'text', html: this.html(r, String(c.body ?? ''), true), boxed: c.boxed !== false };
      case 'html':
        // Özel kod kapalıyken (acil durum anahtarı) ham HTML blokları gönderilmez.
        if (!this.settings.get('custom.enabled')) return null;
        return { ...base, kind: 'html', html: String(c.html ?? ''), boxed: c.boxed !== false };
      case 'recent':
        return { ...base, kind: 'recent', limit: Number(c.limit ?? 5) };
      case 'stats':
      case 'online':
      case 'birthdays':
        return { ...base, kind: r.kind };
      case 'discord':
        // Eklenti kapalıysa blok gösterilmez (yerleşimde kalır, açılınca geri gelir)
        if (!this.settings.plugin(r.kind)) return null;
        return { ...base, kind: r.kind };
      default:
        return null;
    }
  }

  /** Ziyaretçiye göre ana sayfa yerleşimi. */
  async layout(viewer: RequestViewer): Promise<HomeLayout> {
    const now = this.clock.now();
    const out: HomeLayout = { top: [], sidebar: [], bottom: [] };
    for (const r of await this.rows()) {
      if (!this.visible(r, viewer, now)) continue;
      const block = this.toBlock(r);
      const pos = r.position as keyof HomeLayout;
      if (block && out[pos]) out[pos].push(block);
    }
    return out;
  }

  async adminList(): Promise<AdminHomeBlock[]> {
    // Kaldırılan eklentilerin blokları (sohbet kutusu, oyun sunucusu) listede gösterilmez
    return (await this.rows()).filter((r) => (HOME_BLOCK_KINDS as readonly string[]).includes(r.kind)).map(
      (r) =>
        ({
          id: r.id,
          kind: r.kind,
          position: r.position,
          title: r.title,
          visibility: r.visibility,
          isEnabled: r.is_enabled === 1,
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          config: parseConfig(r.config_json),
          updatedAt: r.updated_at,
        }) as AdminHomeBlock,
    );
  }

  /** Tüm yerleşimi kaydeder (sıra gönderilen diziye göre; listede olmayan bloklar silinir). */
  async save(viewer: RequestViewer, input: HomeLayoutInput): Promise<void> {
    const fields: Record<string, string> = {};
    input.blocks.forEach((b, i) => {
      if (b.kind === 'announcement' && b.config.icon && !iconExists(b.config.icon)) fields[`blocks.${i}.config.icon`] = 'İkon bulunamadı.';
      if (b.startsAt && b.endsAt && b.endsAt <= b.startsAt) fields[`blocks.${i}.endsAt`] = 'Bitiş, başlangıçtan sonra olmalı.';
    });
    if (Object.keys(fields).length) throw Errors.validation(fields, Object.values(fields)[0]);

    const existing = await this.db.q.selectFrom('home_blocks').selectAll().execute();
    const byId = new Map(existing.map((r) => [r.id, r]));

    // Ham HTML blokları eklemek ya da kodunu değiştirmek "Özel kod" yetkisi ister (silmek ve taşımak serbest).
    if (!can(viewer, 'admin.customCode')) {
      const touched = input.blocks.some((b) => {
        if (b.kind !== 'html') return false;
        const prev = b.id ? byId.get(b.id) : undefined;
        return !prev || prev.kind !== 'html' || JSON.stringify(parseConfig(prev.config_json)) !== JSON.stringify(b.config);
      });
      if (touched) throw Errors.forbidden('Özel HTML blokları için "Özel kod" yetkisi gerekir.');
    }
    const oldImages = new Set(existing.flatMap((r) => imagesOf(r.kind, parseConfig(r.config_json))));
    const newImages = new Set(input.blocks.flatMap((b) => imagesOf(b.kind, b.config as Record<string, unknown>)));
    const now = this.clock.now();

    await this.db.tx(async () => {
      const keep = new Set<number>();
      for (const [order, b] of input.blocks.entries()) {
        const values = {
          position: b.position,
          kind: b.kind,
          title: b.title,
          config_json: JSON.stringify(b.config),
          visibility: b.visibility,
          is_enabled: b.isEnabled ? 1 : 0,
          starts_at: b.startsAt,
          ends_at: b.endsAt,
          sort_order: order,
        } as const;
        const prev = b.id ? byId.get(b.id) : undefined;
        if (prev) {
          keep.add(prev.id);
          // İçerik değişmediyse güncellenme zamanı korunur (kapatılan duyurular yeniden çıkmasın).
          const changed =
            prev.kind !== values.kind || prev.title !== values.title || prev.config_json !== values.config_json || prev.starts_at !== values.starts_at || prev.ends_at !== values.ends_at;
          await this.db.q
            .updateTable('home_blocks')
            .set({ ...values, ...(changed ? { updated_at: now } : {}) })
            .where('id', '=', prev.id)
            .execute();
        } else {
          await this.db.q.insertInto('home_blocks').values({ ...values, created_at: now, updated_at: now }).execute();
        }
      }
      const remove = existing.filter((r) => !keep.has(r.id)).map((r) => r.id);
      if (remove.length) await this.db.q.deleteFrom('home_blocks').where('id', 'in', remove).execute();
    });

    for (const url of oldImages) if (!newImages.has(url)) await this.deleteByUrl(url);
    await this.cache.invalidate(NS);
    await this.audit.log({ type: 'admin', action: 'home.layout', actorId: viewer.user!.id, ip: viewer.ip, data: { blocks: input.blocks.length } });
  }

  async uploadImage(viewer: RequestViewer, file: UploadedImage): Promise<{ url: string }> {
    const saved = await this.storage.saveImage(file.buffer, { purpose: 'home_block', ownerUserId: viewer.user!.id, maxBytes: 4 * 1024 * 1024, maxDimension: 2400 });
    return { url: this.storage.publicUrl(saved)! };
  }

  private async deleteByUrl(url: string): Promise<void> {
    const file = await this.db.q.selectFrom('files').select('id').where('path', '=', url.slice('/uploads/'.length)).executeTakeFirst();
    if (file) await this.storage.delete(file.id);
  }
}
