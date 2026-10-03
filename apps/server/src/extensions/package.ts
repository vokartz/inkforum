import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { extensionManifestSchema, type ExtensionManifest } from '@forum/shared';
import { ArchiveError, readArchive, stripRoot, type ArchiveFiles } from './archive.js';

export const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;

export class PackageError extends Error {}

export interface ParsedPackage {
  manifest: ExtensionManifest;
  files: ArchiveFiles;
  dependencies: string[];
  hasNodeModules: boolean;
  size: number;
  warnings: string[];
}

function json(buf: Buffer | undefined, name: string): Record<string, unknown> | null {
  if (!buf) return null;
  try {
    const v = JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, '')) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new PackageError(`${name} geçerli bir JSON değil.`);
  }
}

function idFromName(name: string): string {
  return name
    .replace(/^@[^/]+\//, '')
    .replace(/^inkforum-(?:extension-|ext-)?/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 40);
}

export function parseManifest(files: ArchiveFiles): { manifest: ExtensionManifest; dependencies: string[] } {
  const own = json(files.get('inkforum.json'), 'inkforum.json');
  const pkg = json(files.get('package.json'), 'package.json');
  const fromPkg = pkg && typeof pkg.inkforum === 'object' && pkg.inkforum ? (pkg.inkforum as Record<string, unknown>) : null;
  if (!own && !fromPkg) throw new PackageError('Pakette inkforum.json bulunamadı. Eklentiler kökte bir inkforum.json dosyası (ya da package.json içinde "inkforum" alanı) içermelidir.');
  const author = pkg?.author;
  const base: Record<string, unknown> = {
    id: typeof pkg?.name === 'string' ? idFromName(pkg.name) : undefined,
    name: typeof pkg?.name === 'string' ? pkg.name : undefined,
    version: pkg?.version,
    description: pkg?.description,
    author: typeof author === 'string' ? author : author && typeof author === 'object' ? (author as { name?: string }).name : undefined,
    homepage: pkg?.homepage,
    license: pkg?.license,
  };
  const raw = { ...Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined)), ...(fromPkg ?? {}), ...(own ?? {}) };
  const parsed = extensionManifestSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new PackageError(`inkforum.json: ${issue.path.join('.') || 'bildirim'} — ${issue.message}`);
  }
  const deps = pkg && pkg.dependencies && typeof pkg.dependencies === 'object' ? Object.keys(pkg.dependencies as object) : [];
  return { manifest: parsed.data, dependencies: deps.filter((d) => d !== '@inkforum/sdk') };
}

export function parsePackage(buf: Buffer): ParsedPackage {
  if (buf.length > MAX_PACKAGE_BYTES) throw new PackageError('Paket en fazla 50 MB olabilir.');
  let files: ArchiveFiles;
  try {
    files = stripRoot(readArchive(buf));
  } catch (e) {
    throw new PackageError(e instanceof ArchiveError ? e.message : 'Paket açılamadı.');
  }
  const { manifest, dependencies } = parseManifest(files);
  const warnings: string[] = [];
  if (manifest.server && !files.has(manifest.server)) throw new PackageError(`Sunucu dosyası pakette yok: ${manifest.server}`);
  for (const f of [...manifest.client.scripts, ...manifest.client.styles]) {
    if (!files.has(`public/${f}`)) throw new PackageError(`İstemci dosyası pakette yok: public/${f}`);
  }
  if (manifest.server && !/\.(m?js|cjs)$/.test(manifest.server)) warnings.push('Sunucu dosyası .mjs ya da .js olmalı (TypeScript derlenmiş olarak gelmeli).');
  const hasNodeModules = [...files.keys()].some((p) => p.startsWith('node_modules/'));
  if (dependencies.length && !hasNodeModules) warnings.push(`Bağımlılıklar kurulurken npm çalıştırılacak: ${dependencies.join(', ')}`);
  let size = 0;
  for (const b of files.values()) size += b.length;
  return { manifest, files, dependencies, hasNodeModules, size, warnings };
}

export function writeFiles(files: ArchiveFiles, dest: string): void {
  const root = normalize(dest) + sep;
  for (const [p, data] of files) {
    const target = normalize(join(dest, p));
    if (!target.startsWith(root)) throw new PackageError(`Geçersiz dosya yolu: ${p}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
}

interface NpmVersion {
  name: string;
  version: string;
  dist?: { tarball?: string; integrity?: string; shasum?: string; unpackedSize?: number };
}

export async function downloadNpm(name: string, wanted: string, registry = 'https://registry.npmjs.org'): Promise<{ buf: Buffer; version: string }> {
  const metaUrl = `${registry.replace(/\/+$/, '')}/${name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name)}`;
  const res = await fetch(metaUrl, { headers: { accept: 'application/vnd.npm.install-v1+json' }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) throw new PackageError(`npm'de "${name}" adlı paket bulunamadı.`);
  if (!res.ok) throw new PackageError(`npm kayıt defterine ulaşılamadı (HTTP ${res.status}).`);
  const meta = (await res.json()) as { 'dist-tags'?: Record<string, string>; versions?: Record<string, NpmVersion> };
  const tags = meta['dist-tags'] ?? {};
  const versions = meta.versions ?? {};
  const version = tags[wanted] ?? (versions[wanted] ? wanted : pickVersion(Object.keys(versions), wanted));
  const v = version ? versions[version] : undefined;
  if (!v?.dist?.tarball) throw new PackageError(`"${name}" için "${wanted}" sürümü bulunamadı.`);
  if (v.dist.unpackedSize && v.dist.unpackedSize > 4 * MAX_PACKAGE_BYTES) throw new PackageError('Paket çok büyük.');
  const tar = await fetch(v.dist.tarball, { signal: AbortSignal.timeout(60_000) });
  if (!tar.ok || !tar.body) throw new PackageError(`Paket indirilemedi (HTTP ${tar.status}).`);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of tar.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.length;
    if (total > MAX_PACKAGE_BYTES) throw new PackageError('Paket en fazla 50 MB olabilir.');
    chunks.push(Buffer.from(chunk));
  }
  const buf = Buffer.concat(chunks);
  const integrity = v.dist.integrity;
  if (integrity?.startsWith('sha512-')) {
    if (createHash('sha512').update(buf).digest('base64') !== integrity.slice(7)) throw new PackageError('Paket bütünlük denetiminden geçemedi (sha512).');
  } else if (v.dist.shasum) {
    if (createHash('sha1').update(buf).digest('hex') !== v.dist.shasum) throw new PackageError('Paket bütünlük denetiminden geçemedi (sha1).');
  }
  return { buf, version: version! };
}

function pickVersion(all: string[], range: string): string | undefined {
  const clean = all.filter((v) => /^\d+\.\d+\.\d+$/.test(v));
  const sorted = clean.sort((a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    return pb[0]! - pa[0]! || pb[1]! - pa[1]! || pb[2]! - pa[2]!;
  });
  const m = /^([\^~])?(\d+)(?:\.(\d+|x))?(?:\.(\d+|x))?$/.exec(range.trim());
  if (!m) return undefined;
  const [maj, min] = [Number(m[2]), m[3] && m[3] !== 'x' ? Number(m[3]) : null];
  return sorted.find((v) => {
    const [a, b] = v.split('.').map(Number) as [number, number];
    if (a !== maj) return false;
    if (m[1] === '^' || min === null) return true;
    return b === min;
  });
}
