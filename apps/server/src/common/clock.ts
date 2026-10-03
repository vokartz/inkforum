import { Injectable } from '@nestjs/common';

@Injectable()
export class Clock {
  private offsetMs = 0;

  now(): number {
    return Date.now() + this.offsetMs;
  }

  date(): Date {
    return new Date(this.now());
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }

  reset(): void {
    this.offsetMs = 0;
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
