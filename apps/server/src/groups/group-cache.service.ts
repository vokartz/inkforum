import { Injectable } from '@nestjs/common';
import type { GroupBadge } from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { CacheService } from '../cache/cache.service.js';
import { StorageService } from '../storage/storage.service.js';

export interface CachedGroup extends Row<'member_groups'> {
  iconUrl: string | null;
}

export const GROUPS_NS = 'groups';

/** Grup tablosu küçüktür; tamamı bellekte tutulur. */
@Injectable()
export class GroupCacheService {
  constructor(
    private readonly db: Db,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
  ) {}

  async all(): Promise<CachedGroup[]> {
    return this.cache.wrap(GROUPS_NS, 'all', async () => {
      const rows = await this.db.q
        .selectFrom('member_groups')
        .leftJoin('files', 'files.id', 'member_groups.icon_file_id')
        .selectAll('member_groups')
        .select('files.path as icon_path')
        .orderBy('member_groups.sort_order')
        .orderBy('member_groups.id')
        .execute();
      return rows.map(({ icon_path, ...g }) => ({ ...g, iconUrl: this.storage.publicUrl(icon_path ? { path: icon_path } : null) }));
    });
  }

  async map(): Promise<Map<number, CachedGroup>> {
    return this.cache.wrap(GROUPS_NS, 'map', async () => new Map((await this.all()).map((g) => [g.id, g])));
  }

  async get(id: number | null | undefined): Promise<CachedGroup | undefined> {
    if (!id) return undefined;
    return (await this.map()).get(id);
  }

  async bySystemKey(key: string): Promise<CachedGroup> {
    const g = (await this.all()).find((x) => x.system_key === key);
    if (!g) throw new Error(`Sistem grubu bulunamadı: ${key}`);
    return g;
  }

  /** Mesaj sayısına uyan mesaj grubu (en yüksek eşik). */
  async postGroupFor(postCount: number): Promise<CachedGroup | undefined> {
    let best: CachedGroup | undefined;
    for (const g of await this.all()) {
      if (g.kind !== 'post_count' || g.min_posts == null || g.min_posts > postCount) continue;
      if (!best || g.min_posts > (best.min_posts ?? -1)) best = g;
    }
    return best;
  }

  badge(g: CachedGroup): GroupBadge {
    return { id: g.id, name: g.name, color: g.color, iconUrl: g.iconUrl, iconCount: g.icon_count };
  }

  /** Grup değişiklikleri (miras, sistem anahtarı) yetki çözümlemesini de etkiler. */
  async invalidate(): Promise<void> {
    await this.cache.invalidate(GROUPS_NS);
    await this.cache.invalidate('permissions');
  }
}
