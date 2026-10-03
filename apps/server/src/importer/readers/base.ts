import type { SqlValue } from '../sql-dump.js';
import { decodeEntities, ipText, num } from '../text.js';
import type { ReaderContext, SourceCounts } from '../model.js';
import { q, type Stage } from '../stage.js';

export abstract class BaseReader {
  constructor(
    protected readonly stage: Stage,
    protected readonly prefix: string,
    protected readonly ctx: ReaderContext,
  ) {}

  protected t(name: string): string {
    return this.prefix + name;
  }

  protected tq(name: string, alias = ''): string {
    return `${q(this.prefix + name)}${alias ? ` ${alias}` : ''}`;
  }

  protected has(name: string): boolean {
    return this.stage.has(this.t(name));
  }

  protected col(name: string, column: string): boolean {
    return this.stage.hasColumn(this.t(name), column);
  }

  protected count(name: string, where = ''): number {
    return this.stage.count(this.t(name), where);
  }

  protected s(v: SqlValue | undefined): string {
    return this.ctx.text(v);
  }

  protected e(v: SqlValue | undefined): string {
    return decodeEntities(this.ctx.text(v)).replace(/\u00a0/g, ' ').trim();
  }

  protected n(v: SqlValue | undefined): number {
    return num(v);
  }

  protected id(v: SqlValue | undefined): string {
    return String(num(v));
  }

  protected ms(v: SqlValue | undefined): number | null {
    const x = num(v);
    return x > 0 ? x * 1000 : null;
  }

  protected ip(v: SqlValue | undefined): string | null {
    return ipText(v);
  }

  protected csv(v: SqlValue | undefined): string[] {
    return this.s(v)
      .split(',')
      .map((x) => x.trim())
      .filter((x) => /^-?\d+$/.test(x));
  }

  protected url(path: string): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('//')) return `https:${path}`;
    if (!this.ctx.baseUrl) return null;
    return `${this.ctx.baseUrl}/${path.replace(/^\.?\//, '')}`;
  }

  protected emptyCounts(): SourceCounts {
    return { users: 0, groups: 0, categories: 0, boards: 0, topics: 0, posts: 0, polls: 0, conversations: 0, attachments: 0 };
  }
}

export const isImageName = (name: string, mime = '') => /^image\/(png|jpe?g|gif|webp)/i.test(mime) || /\.(png|jpe?g|gif|webp)$/i.test(name);

export function baseFrom(value: string, suffix: RegExp): string | null {
  const v = value.trim();
  if (!/^https?:\/\//i.test(v)) return null;
  return v.replace(suffix, '').replace(/\/+$/, '');
}
