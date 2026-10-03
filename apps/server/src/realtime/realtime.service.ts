import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Response } from 'express';
import type { RealtimeEvent } from '@forum/shared';

const HEARTBEAT_MS = 25_000;
const MAX_PER_USER = 8;

@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly clients = new Map<number, Set<Response>>();
  private readonly heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);

  constructor() {
    this.heartbeat.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.heartbeat);
    for (const set of this.clients.values()) for (const res of set) res.end();
    this.clients.clear();
  }

  subscribe(userId: number, res: Response): void {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 4000\n\n');
    const set = this.clients.get(userId) ?? new Set<Response>();
    if (set.size >= MAX_PER_USER) {
      const oldest = set.values().next().value;
      if (oldest) {
        set.delete(oldest);
        oldest.end();
      }
    }
    set.add(res);
    this.clients.set(userId, set);
    this.write(res, { type: 'hello' });
    res.on('close', () => {
      set.delete(res);
      if (!set.size) this.clients.delete(userId);
    });
  }

  publish(userIds: number | number[], event: RealtimeEvent): void {
    for (const id of Array.isArray(userIds) ? userIds : [userIds]) {
      for (const res of this.clients.get(id) ?? []) this.write(res, event);
    }
  }

  broadcast(event: RealtimeEvent): void {
    for (const set of this.clients.values()) for (const res of set) this.write(res, event);
  }

  connected(userId?: number): number {
    if (userId !== undefined) return this.clients.get(userId)?.size ?? 0;
    let n = 0;
    for (const set of this.clients.values()) n += set.size;
    return n;
  }

  private write(res: Response, event: RealtimeEvent): void {
    try {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    } catch {
    }
  }

  private ping(): void {
    for (const set of this.clients.values()) {
      for (const res of set) {
        try {
          res.write(': ping\n\n');
        } catch {
        }
      }
    }
  }
}
