import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';

export interface TarEntry {
  name: string;
  file?: string;
  data?: Buffer;
  size: number;
  mtime: number;
}

function header(name: string, size: number, mtime: number, type: '0' | '5'): Buffer {
  const h = Buffer.alloc(512, 0);
  let n = name;
  let prefix = '';
  if (Buffer.byteLength(n) > 100) {
    const cut = n.lastIndexOf('/', n.length - 1 - 0);
    let i = cut;
    while (i > 0 && (Buffer.byteLength(n.slice(i + 1)) > 100 || Buffer.byteLength(n.slice(0, i)) > 155)) i = n.lastIndexOf('/', i - 1);
    if (i <= 0) throw new Error(`Yol çok uzun: ${name}`);
    prefix = n.slice(0, i);
    n = n.slice(i + 1);
  }
  h.write(n, 0, 100, 'utf8');
  h.write(type === '5' ? '0000755\0' : '0000644\0', 100, 8, 'ascii');
  h.write('0000000\0', 108, 8, 'ascii');
  h.write('0000000\0', 116, 8, 'ascii');
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  h.write(`${Math.floor(mtime / 1000).toString(8).padStart(11, '0')}\0`, 136, 12, 'ascii');
  h.write('        ', 148, 8, 'ascii');
  h.write(type, 156, 1, 'ascii');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return h;
}

export async function writeTarGz(target: string, entries: AsyncIterable<TarEntry> | Iterable<TarEntry>): Promise<void> {
  async function* chunks() {
    for await (const e of entries) {
      yield header(e.name, e.size, e.mtime, '0');
      if (e.data) yield e.data;
      else if (e.file) for await (const c of createReadStream(e.file)) yield c as Buffer;
      const pad = (512 - (e.size % 512)) % 512;
      if (pad) yield Buffer.alloc(pad, 0);
    }
    yield Buffer.alloc(1024, 0);
  }
  await pipeline(Readable.from(chunks()), createGzip({ level: 6 }), createWriteStream(target));
}

function parseOctal(buf: Buffer, start: number, len: number): number {
  const s = buf.toString('ascii', start, start + len).replace(/\0.*$/, '').trim();
  return s ? parseInt(s, 8) : 0;
}

export async function extractTarGz(source: string, dest: string, filter: (name: string) => boolean = () => true): Promise<string[]> {
  const written: string[] = [];
  const pending: Array<Promise<void>> = [];
  let buf: Buffer = Buffer.alloc(0);
  let current: { name: string; remaining: number; pad: number; out: import('node:fs').WriteStream | null } | null = null;
  let ended = false;
  const root = normalize(dest) + sep;

  const sink = new Writable({
    write(chunk: Buffer, _enc, cb) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      const step = (): void => {
        while (!ended) {
          if (current) {
            if (current.remaining > 0) {
              if (!buf.length) return;
              const take = Math.min(current.remaining, buf.length);
              const part = buf.subarray(0, take);
              buf = buf.subarray(take);
              current.remaining -= take;
              current.out?.write(part);
              continue;
            }
            if (buf.length < current.pad) return;
            buf = buf.subarray(current.pad);
            current.out?.end();
            current = null;
            continue;
          }
          if (buf.length < 512) return;
          const h = buf.subarray(0, 512);
          buf = buf.subarray(512);
          if (h.every((b) => b === 0)) {
            ended = true;
            return;
          }
          const name = h.toString('utf8', 0, 100).replace(/\0.*$/, '');
          const prefix = h.toString('utf8', 345, 500).replace(/\0.*$/, '');
          const full = (prefix ? `${prefix}/${name}` : name).replace(/\\/g, '/');
          const size = parseOctal(h, 124, 12);
          const type = String.fromCharCode(h[156] || 48);
          const pad = (512 - (size % 512)) % 512;
          const safe = !full.startsWith('/') && !full.split('/').includes('..');
          const target = normalize(join(dest, full));
          let out: import('node:fs').WriteStream | null = null;
          if ((type === '0' || type === '\0') && safe && target.startsWith(root) && filter(full)) {
            mkdirSync(dirname(target), { recursive: true });
            out = createWriteStream(target);
            const o = out;
            pending.push(new Promise<void>((resolve, reject) => o.once('finish', () => resolve()).once('error', reject)));
            written.push(full);
          }
          current = { name: full, remaining: size, pad, out };
        }
      };
      step();
      cb();
    },
    final(cb) {
      current?.out?.end();
      cb();
    },
  });
  await pipeline(createReadStream(source), createGunzip(), sink);
  await Promise.all(pending);
  return written;
}
