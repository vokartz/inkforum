import { Injectable, Logger } from '@nestjs/common';
import { Db } from '../database/db.service.js';

/** Uygulama içi olaylar. Kalıcı işler (e-posta, başarı değerlendirme) dinleyicilerde kuyruğa atılır. */
export interface AppEvents {
  'user.registered': { userId: number };
  'user.activated': { userId: number };
  'user.emailVerified': { userId: number };
  'user.loggedIn': { userId: number };
  'user.profileUpdated': { userId: number };
  'user.avatarChanged': { userId: number };
  'user.twoFactorChanged': { userId: number; enabled: boolean };
  'user.groupsChanged': { userId: number };
  'user.postCountChanged': { userId: number };
  'user.warningPointsChanged': { userId: number };
  'achievement.awarded': { userId: number; achievementId: number };
  'topic.created': { topicId: number; postId: number; userId: number; boardId: number };
  'post.created': { topicId: number; postId: number; userId: number; boardId: number };
  'user.banned': { userId: number; banId: number };
}

export type AppEventName = keyof AppEvents;
type Handler<K extends AppEventName> = (payload: AppEvents[K]) => void | Promise<void>;

@Injectable()
export class EventsService {
  private readonly logger = new Logger('Events');
  private readonly handlers = new Map<AppEventName, Array<Handler<any>>>();

  constructor(private readonly db: Db) {}

  on<K extends AppEventName>(name: K, handler: Handler<K>): void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler);
    this.handlers.set(name, list);
  }

  /** Aktif transaction varsa commit sonrasında yayınlanır. */
  emit<K extends AppEventName>(name: K, payload: AppEvents[K]): void {
    this.db.afterCommit(() => this.dispatch(name, payload));
  }

  private async dispatch<K extends AppEventName>(name: K, payload: AppEvents[K]): Promise<void> {
    for (const handler of this.handlers.get(name) ?? []) {
      try {
        await handler(payload);
      } catch (err) {
        this.logger.error(`"${name}" olay dinleyicisi hata verdi: ${err instanceof Error ? err.stack : String(err)}`);
      }
    }
  }
}
