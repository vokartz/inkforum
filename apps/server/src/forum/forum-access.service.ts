import { Injectable } from '@nestjs/common';
import type { BoardPermissions } from '@forum/shared';
import { PermissionsService } from '../permissions/permissions.service.js';
import { Errors } from '../common/errors.js';
import type { RequestViewer } from '../common/request-context.js';
import { ForumCacheService, type CachedBoard } from './forum-cache.service.js';

export interface BoardAccess {
  board: CachedBoard;
  perms: Set<string>;
  can: BoardPermissions;
}

const MOD_KEYS = [
  'mod.topic.pin',
  'mod.topic.lock',
  'mod.topic.move',
  'mod.topic.merge',
  'mod.topic.edit',
  'mod.topic.delete',
  'mod.post.edit',
  'mod.post.delete',
  'mod.post.approve',
];

/** Bölüm bazında erişim: yetki profili + bölüm moderatörlüğü + üst bölüm görünürlüğü. */
@Injectable()
export class ForumAccessService {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly forum: ForumCacheService,
  ) {}

  isBoardModerator(viewer: RequestViewer, board: CachedBoard): boolean {
    if (!viewer.user) return false;
    return board.moderatorUserIds.includes(viewer.user.id) || board.moderatorGroupIds.some((g) => viewer.groupIds.includes(g));
  }

  async perms(viewer: RequestViewer, board: CachedBoard): Promise<Set<string>> {
    if (viewer.isAdmin) return this.permissions.resolveBoard(viewer.groupIds, board.permission_profile_id, true);
    return this.permissions.resolveBoard(viewer.groupIds, board.permission_profile_id, this.isBoardModerator(viewer, board));
  }

  toCan(perms: Set<string>, viewer: RequestViewer): BoardPermissions {
    const has = (k: string) => perms.has(k);
    const member = !!viewer.user;
    return {
      view: has('board.view'),
      createTopic: member && has('topic.create'),
      reply: member && has('post.reply'),
      images: member && has('post.images'),
      moderate: member && MOD_KEYS.some(has),
      pin: member && has('mod.topic.pin'),
      lock: member && has('mod.topic.lock'),
      move: member && has('mod.topic.move'),
      merge: member && has('mod.topic.merge'),
      editTopic: member && has('mod.topic.edit'),
      deleteTopic: member && has('mod.topic.delete'),
      approve: member && has('mod.post.approve'),
      viewDeleted: member && has('mod.post.viewDeleted'),
      poll: member && has('topic.poll'),
      vote: member && has('poll.vote'),
    };
  }

  /** Bölüm ve tüm üst bölümleri görülebiliyorsa erişim bilgisi, değilse null. */
  async access(viewer: RequestViewer, boardId: number): Promise<BoardAccess | null> {
    const chain = await this.forum.ancestry(boardId);
    if (!chain.length) return null;
    for (const b of chain) {
      if (!(await this.perms(viewer, b)).has('board.view')) return null;
    }
    const board = chain[chain.length - 1]!;
    const perms = await this.perms(viewer, board);
    return { board, perms, can: this.toCan(perms, viewer) };
  }

  async require(viewer: RequestViewer, boardId: number): Promise<BoardAccess> {
    const a = await this.access(viewer, boardId);
    if (!a) throw Errors.notFound('Bölüm bulunamadı ya da görüntüleme yetkiniz yok.');
    return a;
  }

  /** Görülebilen bölümler (yapı sırasıyla). Gizli bölümler yalnızca moderatörlere listelenir. */
  async visibleBoards(viewer: RequestViewer, opts: { includeHidden?: boolean } = {}): Promise<Map<number, BoardAccess>> {
    const { boards } = await this.forum.structure();
    const out = new Map<number, BoardAccess>();
    const byId = new Map(boards.map((b) => [b.id, b]));
    // Üst bölümler önce işlensin diye derinliğe göre sırala.
    const depth = (b: CachedBoard): number => {
      let d = 0;
      let cur = b;
      while (cur.parent_id && byId.get(cur.parent_id) && d < 10) {
        cur = byId.get(cur.parent_id)!;
        d++;
      }
      return d;
    };
    for (const b of [...boards].sort((a, c) => depth(a) - depth(c))) {
      if (b.parent_id && !out.has(b.parent_id)) continue;
      const perms = await this.perms(viewer, b);
      if (!perms.has('board.view')) continue;
      const can = this.toCan(perms, viewer);
      if (b.is_hidden && !opts.includeHidden && !can.moderate) continue;
      out.set(b.id, { board: b, perms, can });
    }
    return out;
  }
}
