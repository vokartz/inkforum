import { Injectable } from '@nestjs/common';
import type { BoardIcon, TopicPrefix } from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { CacheService } from '../cache/cache.service.js';
import { StorageService } from '../storage/storage.service.js';
import { fromJson } from '../database/json.js';
import { iconNode } from '../common/icons.js';

export const FORUM_NS = 'forum';

export interface CachedBoard extends Row<'boards'> {
  iconUrl: string | null;
  coverUrl: string | null;
  moderatorUserIds: number[];
  moderatorGroupIds: number[];
}

export interface CachedPrefix extends TopicPrefix {
  boardIds: number[] | null;
  sortOrder: number;
}

export type CachedCategory = Row<'forum_categories'> & { bgUrl: string | null };

export interface ForumStructure {
  categories: CachedCategory[];
  boards: CachedBoard[];
  byId: Map<number, CachedBoard>;
  prefixes: CachedPrefix[];
}

@Injectable()
export class ForumCacheService {
  constructor(
    private readonly db: Db,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
  ) {}

  async structure(): Promise<ForumStructure> {
    return this.cache.wrap(FORUM_NS, 'structure', async () => {
      const [categories, boardRows, mods, prefixRows] = await Promise.all([
        this.db.q
          .selectFrom('forum_categories')
          .leftJoin('files', 'files.id', 'forum_categories.bg_file_id')
          .selectAll('forum_categories')
          .select('files.path as bg_path')
          .orderBy('forum_categories.sort_order')
          .orderBy('forum_categories.id')
          .execute(),
        this.db.q
          .selectFrom('boards')
          .leftJoin('files', 'files.id', 'boards.icon_file_id')
          .leftJoin('files as cover', 'cover.id', 'boards.cover_file_id')
          .selectAll('boards')
          .select(['files.path as icon_path', 'cover.path as cover_path'])
          .orderBy('boards.sort_order')
          .orderBy('boards.id')
          .execute(),
        this.db.q.selectFrom('board_moderators').selectAll().execute(),
        this.db.q.selectFrom('topic_prefixes').selectAll().orderBy('sort_order').orderBy('id').execute(),
      ]);
      const cats: CachedCategory[] = categories.map(({ bg_path, ...c }) => ({ ...c, bgUrl: this.storage.publicUrl(bg_path ? { path: bg_path } : null) }));
      const catOrder = new Map(cats.map((c, i) => [c.id, i]));
      const boards: CachedBoard[] = boardRows
        .map(({ icon_path, cover_path, ...b }) => ({
          ...b,
          iconUrl: this.storage.publicUrl(icon_path ? { path: icon_path } : null),
          coverUrl: this.storage.publicUrl(cover_path ? { path: cover_path } : null),
          moderatorUserIds: mods.filter((m) => m.board_id === b.id && m.user_id).map((m) => m.user_id!),
          moderatorGroupIds: mods.filter((m) => m.board_id === b.id && m.group_id).map((m) => m.group_id!),
        }))
        .sort((a, b) => (catOrder.get(a.category_id) ?? 0) - (catOrder.get(b.category_id) ?? 0) || a.sort_order - b.sort_order || a.id - b.id);
      const prefixes: CachedPrefix[] = prefixRows.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        boardIds: fromJson<number[] | null>(p.board_ids_json, null),
        sortOrder: p.sort_order,
      }));
      return { categories: cats, boards, byId: new Map(boards.map((b) => [b.id, b])), prefixes };
    });
  }

  async board(id: number): Promise<CachedBoard | undefined> {
    return (await this.structure()).byId.get(id);
  }

  async prefixesFor(boardId: number): Promise<TopicPrefix[]> {
    return (await this.structure()).prefixes
      .filter((p) => !p.boardIds || p.boardIds.includes(boardId))
      .map(({ id, name, color }) => ({ id, name, color }));
  }

  async prefix(id: number | null): Promise<TopicPrefix | null> {
    if (!id) return null;
    const p = (await this.structure()).prefixes.find((x) => x.id === id);
    return p ? { id: p.id, name: p.name, color: p.color } : null;
  }

  icon(b: Pick<CachedBoard, 'icon_kind' | 'icon_name' | 'icon_color' | 'iconUrl'>): BoardIcon {
    const kind = b.icon_kind === 'image' && !b.iconUrl ? 'icon' : b.icon_kind;
    return {
      kind,
      name: b.icon_name,
      nodes: kind === 'icon' ? iconNode(b.icon_name, 'duotone') : null,
      color: b.icon_color,
      url: kind === 'image' ? b.iconUrl : null,
    };
  }

  async ancestry(boardId: number): Promise<CachedBoard[]> {
    const { byId } = await this.structure();
    const out: CachedBoard[] = [];
    let cur = byId.get(boardId);
    const seen = new Set<number>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return out;
  }

  async invalidate(): Promise<void> {
    await this.cache.invalidate(FORUM_NS);
  }
}
