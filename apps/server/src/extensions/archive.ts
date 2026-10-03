import { gunzipSync, inflateRawSync } from 'node:zlib';

export interface ArchiveLimits {
  maxFiles: number;
  maxTotalBytes: number;
  maxFileBytes: number;
}

export const DEFAULT_LIMITS: ArchiveLimits = { maxFiles: 5000, maxTotalBytes: 200 * 1024 * 1024, maxFileBytes: 50 * 1024 * 1024 };

export class ArchiveError extends Error {}

export type ArchiveFiles = Map<string, Buffer>;

function cleanPath(raw: string): string | null {
  const p = raw.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!p || p.endsWith('/')) return null;
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.split('/').some((s) => s === '..' || s === '')) throw new ArchiveError(`Geçersiz dosya yolu: ${raw}`);
  return p;
}

class Collector {
  readonly files: ArchiveFiles = new Map();
  private total = 0;
  constructor(private readonly limits: ArchiveLimits) {}
  add(raw: string, data: Buffer): void {
    const p = cleanPath(raw);
    if (!p) return;
    if (p.split('/').some((s) => s === '__MACOSX' || s === '.DS_Store')) return;
    if (data.length > this.limits.maxFileBytes) throw new ArchiveError(`Dosya çok büyük: ${p}`);
    this.total += data.length;
    if (this.total > this.limits.maxTotalBytes) throw new ArchiveError('Paket açıldığında izin verilen boyutu aşıyor.');
    if (this.files.size >= this.limits.maxFiles) throw new ArchiveError('Pakette çok fazla dosya var.');
    this.files.set(p, data);
  }
}

export function isZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50;
}

export function isGzip(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

export function readArchive(buf: Buffer, limits: ArchiveLimits = DEFAULT_LIMITS): ArchiveFiles {
  if (isZip(buf)) return readZip(buf, limits);
  if (isGzip(buf)) {
    let tar: Buffer;
    try {
      tar = gunzipSync(buf, { maxOutputLength: limits.maxTotalBytes + 10 * 1024 * 1024 });
    } catch {
      throw new ArchiveError('Arşiv açılamadı (bozuk ya da çok büyük .tgz).');
    }
    return readTar(tar, limits);
  }
  throw new ArchiveError('Desteklenmeyen paket biçimi. .zip ya da .tgz yükleyin.');
}

function readZip(buf: Buffer, limits: ArchiveLimits): ArchiveFiles {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ArchiveError('Zip dosyası bozuk (merkez dizin bulunamadı).');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = new Collector(limits);
  for (let n = 0; n < count; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) throw new ArchiveError('Zip dosyası bozuk.');
    const flags = buf.readUInt16LE(off + 8);
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const size = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const extAttr = buf.readUInt32LE(off + 38);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', off + 46, off + 46 + nameLen);
    off += 46 + nameLen + extraLen + commentLen;
    if (flags & 0x1) throw new ArchiveError('Şifreli zip dosyaları desteklenmez.');
    if (((extAttr >>> 16) & 0o170000) === 0o120000) continue;
    if (name.endsWith('/')) continue;
    if (size > limits.maxFileBytes) throw new ArchiveError(`Dosya çok büyük: ${name}`);
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new ArchiveError('Zip dosyası bozuk.');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + compSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try {
        data = inflateRawSync(raw, { maxOutputLength: limits.maxFileBytes + 1 });
      } catch {
        throw new ArchiveError(`Dosya açılamadı: ${name}`);
      }
    } else throw new ArchiveError(`Desteklenmeyen sıkıştırma yöntemi (${method}): ${name}`);
    if (data.length !== size) throw new ArchiveError(`Dosya boyutu tutmuyor: ${name}`);
    out.add(name, data);
  }
  return out.files;
}

function octal(h: Buffer, start: number, len: number): number {
  const s = h.toString('ascii', start, start + len).replace(/\0.*$/, '').trim();
  return s ? parseInt(s, 8) : 0;
}

function readTar(buf: Buffer, limits: ArchiveLimits): ArchiveFiles {
  const out = new Collector(limits);
  let off = 0;
  let longName: string | null = null;
  let paxPath: string | null = null;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const name = h.toString('utf8', 0, 100).replace(/\0.*$/, '');
    const prefix = h.toString('utf8', 345, 500).replace(/\0.*$/, '');
    const size = octal(h, 124, 12);
    const type = String.fromCharCode(h[156] || 48);
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') {
      longName = body.toString('utf8').replace(/\0.*$/, '');
      continue;
    }
    if (type === 'x') {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'));
      paxPath = m ? m[1]! : null;
      continue;
    }
    if (type === 'g') continue;
    const full = paxPath ?? longName ?? (prefix ? `${prefix}/${name}` : name);
    paxPath = null;
    longName = null;
    if (type !== '0' && type !== '\0' && type !== '7') continue;
    out.add(full, Buffer.from(body));
  }
  return out.files;
}

export function stripRoot(files: ArchiveFiles): ArchiveFiles {
  const candidates = [...files.keys()]
    .filter((p) => p.endsWith('inkforum.json') || p.endsWith('package.json'))
    .map((p) => p.slice(0, p.lastIndexOf('/') + 1))
    .sort((a, b) => a.split('/').length - b.split('/').length);
  const root = candidates.find((dir) => files.has(`${dir}inkforum.json`)) ?? candidates[0] ?? '';
  if (!root) return files;
  const out: ArchiveFiles = new Map();
  for (const [p, data] of files) if (p.startsWith(root)) out.set(p.slice(root.length), data);
  return out;
}
