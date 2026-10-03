import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { EXTENSION_ID, extensionManifestSchema, type ExtensionManifest } from '@forum/shared';
import { SDK_RUNTIME } from './sdk-runtime.js';

export interface ZipEntry {
  name: string;
  data: Buffer;
}

export function writeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x800, 8);
    cen.writeUInt16LE(useDeflate ? 8 : 0, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

function readTree(dir: string, prefix = ''): ZipEntry[] {
  const out: ZipEntry[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      if (name === 'node_modules' || name.startsWith('.DS_Store') || name.endsWith('.zip')) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push({ name: prefix + relative(dir, p).split(sep).join('/'), data: readFileSync(p) });
    }
  };
  walk(dir);
  return out;
}

const TEXT = /\.(json|mjs|js|css|md|txt|html)$/;

export class SdkBundle {
  readonly dir: string | null;

  constructor(root: string) {
    this.dir = [join(root, 'sdk'), join(root, 'packages', 'sdk')].find((d) => existsSync(join(d, 'starter'))) ?? null;
  }

  private file(...parts: string[]): Buffer | null {
    if (!this.dir) return null;
    const p = join(this.dir, ...parts);
    return existsSync(p) ? readFileSync(p) : null;
  }

  private typesPackage(prefix: string): ZipEntry[] {
    const pkg = { name: '@inkforum/sdk', version: '1.0.0', type: 'module', main: './index.js', types: './index.d.ts', exports: { '.': { types: './index.d.ts', import: './index.js' }, './client': { types: './client.d.ts', import: './client.js' } } };
    const out: ZipEntry[] = [
      { name: `${prefix}node_modules/@inkforum/sdk/package.json`, data: Buffer.from(JSON.stringify(pkg, null, 2)) },
      { name: `${prefix}node_modules/@inkforum/sdk/index.js`, data: Buffer.from(SDK_RUNTIME) },
      { name: `${prefix}node_modules/@inkforum/sdk/client.js`, data: Buffer.from('export {};\n') },
    ];
    for (const f of ['index.d.ts', 'client.d.ts']) {
      const data = this.file('dist', f);
      if (data) out.push({ name: `${prefix}node_modules/@inkforum/sdk/${f}`, data });
    }
    return out;
  }

  private tools(prefix: string): ZipEntry[] {
    const cli = this.file('bin', 'inkforum-ext.mjs');
    return cli ? [{ name: `${prefix}tools/inkforum-ext.mjs`, data: cli }] : [];
  }

  starter(id: string, name: string): Buffer {
    if (!this.dir) throw new Error('Başlangıç paketi bu kurulumda bulunamadı.');
    const table = id.replace(/-/g, '_');
    const prefix = `${id}/`;
    const files = readTree(join(this.dir, 'starter'), prefix).map((e) =>
      TEXT.test(e.name) ? { name: e.name, data: Buffer.from(e.data.toString('utf8').replace(/__TABLE__/g, table).replace(/__ID__/g, id).replace(/__NAME__/g, name)) } : e,
    );
    files.push({ name: `${prefix}.gitignore`, data: Buffer.from('*.zip\n') });
    return writeZip([...files, ...this.typesPackage(prefix), ...this.tools(prefix)]);
  }

  samples(): Array<{ dir: string; manifest: ExtensionManifest; readme: string | null }> {
    if (!this.dir) return [];
    const base = join(this.dir, 'examples');
    if (!existsSync(base)) return [];
    const out: Array<{ dir: string; manifest: ExtensionManifest; readme: string | null }> = [];
    for (const name of readdirSync(base).sort()) {
      const dir = join(base, name);
      const json = join(dir, 'inkforum.json');
      if (!existsSync(json)) continue;
      const parsed = extensionManifestSchema.safeParse(JSON.parse(readFileSync(json, 'utf8')));
      if (!parsed.success || !EXTENSION_ID.test(parsed.data.id)) continue;
      const readme = join(dir, 'README.md');
      out.push({ dir, manifest: parsed.data, readme: existsSync(readme) ? readFileSync(readme, 'utf8') : null });
    }
    return out;
  }

  sampleZip(id: string): Buffer | null {
    const s = this.samples().find((x) => x.manifest.id === id);
    return s ? writeZip(readTree(s.dir)) : null;
  }
}
