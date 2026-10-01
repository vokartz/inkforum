import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock, MINUTE } from '../common/clock.js';

const GUEST_WINDOW_MS = 15 * MINUTE;
const MAX_GUESTS = 20_000;

/**
 * Çevrimiçi misafir sayacı (bellek içi, IP + tarayıcı özeti). Üyelerin çevrimiçi bilgisi
 * `users.last_active_at` üzerinden hesaplanır; burada yalnızca misafirler tutulur.
 */
@Injectable()
export class PresenceService {
  private readonly guests = new Map<string, number>();

  constructor(private readonly clock: Clock) {}

  touchGuest(ip: string | null, userAgent: string | null): void {
    if (!ip) return;
    // Arama motoru botları misafir sayısına eklenmez.
    if (userAgent && /bot|crawl|spider|slurp|preview/i.test(userAgent)) return;
    const key = createHash('sha1').update(`${ip}|${userAgent ?? ''}`).digest('base64url').slice(0, 16);
    const now = this.clock.now();
    const last = this.guests.get(key);
    if (last && now - last < MINUTE) return;
    this.guests.delete(key);
    this.guests.set(key, now);
    if (this.guests.size > MAX_GUESTS) this.prune(now);
  }

  guestCount(windowMs = GUEST_WINDOW_MS): number {
    const now = this.clock.now();
    this.prune(now);
    let n = 0;
    for (const at of this.guests.values()) if (now - at < windowMs) n++;
    return n;
  }

  private prune(now: number): void {
    for (const [k, at] of this.guests) {
      if (now - at >= GUEST_WINDOW_MS) this.guests.delete(k);
    }
    while (this.guests.size > MAX_GUESTS) {
      const oldest = this.guests.keys().next().value;
      if (oldest === undefined) break;
      this.guests.delete(oldest);
    }
  }
}
