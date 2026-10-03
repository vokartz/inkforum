#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const [, , cmd, ...rest] = process.argv;
const flags = {};
const args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
  else args.push(rest[i]);
}

const ID = /^[a-z][a-z0-9-]{1,39}$/;
const VERSION = /^\d{1,5}\.\d{1,5}\.\d{1,6}(?:-[0-9a-z.-]{1,40})?$/i;

function die(msg) {
  console.error(`\x1b[31m✖\x1b[0m ${msg}`);
  process.exit(1);
}
const ok = (msg) => console.log(`\x1b[32m✔\x1b[0m ${msg}`);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    die(`${file} okunamadı: ${e.message}`);
  }
}

function manifestOf(dir) {
  const own = existsSync(join(dir, 'inkforum.json')) ? readJson(join(dir, 'inkforum.json')) : null;
  const pkg = existsSync(join(dir, 'package.json')) ? readJson(join(dir, 'package.json')) : null;
  if (!own && !pkg?.inkforum) die('inkforum.json bulunamadı. Eklenti klasöründe misiniz?');
  return { ...(pkg ? { name: pkg.name, version: pkg.version, description: pkg.description } : {}), ...(pkg?.inkforum ?? {}), ...(own ?? {}) };
}

function validate(dir) {
  const m = manifestOf(dir);
  const errors = [];
  if (!ID.test(m.id ?? '')) errors.push('id: küçük harfle başlamalı; yalnızca a-z, 0-9 ve - (2-40 karakter).');
  if (!m.name) errors.push('name gerekli.');
  if (!VERSION.test(m.version ?? '')) errors.push('version 1.2.3 biçiminde olmalı.');
  if (m.server && !existsSync(join(dir, m.server))) errors.push(`server dosyası yok: ${m.server} (önce "inkforum-ext build" çalıştırın)`);
  for (const f of [...(m.client?.scripts ?? []), ...(m.client?.styles ?? [])]) if (!existsSync(join(dir, 'public', f))) errors.push(`public/${f} yok.`);
  for (const s of m.settings ?? []) if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(s.key ?? '')) errors.push(`settings: geçersiz anahtar "${s.key}"`);
  for (const p of m.permissions ?? []) if (!/^[a-z][a-zA-Z0-9_]{0,40}$/.test(p.key ?? '')) errors.push(`permissions: geçersiz anahtar "${p.key}"`);
  if (errors.length) die(`inkforum.json hataları:\n  - ${errors.join('\n  - ')}`);
  return m;
}

function init() {
  const id = args[0];
  if (!id || !ID.test(id)) die('Kullanım: inkforum-ext init <kimlik>  (ör. inkforum-ext init basvuru)');
  const dir = resolve(flags.dir ?? id);
  if (existsSync(dir) && readdirSync(dir).length) die(`${dir} boş değil.`);
  const name = typeof flags.name === 'string' ? flags.name : id.replace(/(^|-)([a-z])/g, (_, s, c) => `${s ? ' ' : ''}${c.toUpperCase()}`);
  const starter = join(dirname(fileURLToPath(import.meta.url)), '..', 'starter');
  if (!existsSync(starter)) die('Başlangıç şablonu bulunamadı. Başlangıç paketini forumunuzdan indirin: Yönetim → Eklentiler → Eklenti geliştir.');
  const fill = (text) => text.replace(/__TABLE__/g, id.replace(/-/g, '_')).replace(/__ID__/g, id).replace(/__NAME__/g, name);
  const copy = (from, to) => {
    for (const entry of readdirSync(from)) {
      const src = join(from, entry);
      const dest = join(to, entry);
      if (statSync(src).isDirectory()) copy(src, dest);
      else {
        mkdirSync(to, { recursive: true });
        const data = readFileSync(src);
        writeFileSync(dest, /\.(json|mjs|js|css|md|txt|html)$/.test(entry) ? fill(data.toString('utf8')) : data);
      }
    }
  };
  copy(starter, dir);
  writeFileSync(join(dir, '.gitignore'), '*.zip\n');
  ok(`${dir} oluşturuldu.`);
  console.log(`\n  cd ${relative(process.cwd(), dir) || '.'}\n  node ${relative(dir, fileURLToPath(import.meta.url))} pack\n`);
}

async function build() {
  const dir = resolve(args[0] ?? '.');
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch {
    die('esbuild bulunamadı: npm install -D esbuild');
  }
  const src = join(dir, 'src');
  const entry = ['server.ts', 'server.js', 'server.mjs'].map((f) => join(src, f)).find(existsSync);
  if (entry) {
    await esbuild.build({
      entryPoints: [entry],
      outfile: join(dir, 'server.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
      logLevel: 'warning',
    });
    ok('server.mjs');
  }
  const pub = join(src, 'public');
  if (existsSync(pub)) {
    const entries = readdirSync(pub).filter((f) => /\.(ts|js|mjs)$/.test(f)).map((f) => join(pub, f));
    if (entries.length) {
      await esbuild.build({ entryPoints: entries, outdir: join(dir, 'public'), bundle: true, format: 'esm', target: 'es2022', minify: true, logLevel: 'warning' });
      ok(`public/ (${entries.length} modül)`);
    }
  }
  if (!entry && !existsSync(pub)) console.log('src/server.ts ya da src/public/ bulunamadı; derlenecek bir şey yok.');
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt32LE(0, 10);
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
  const cenSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

function pack() {
  const dir = resolve(args[0] ?? '.');
  const m = validate(dir);
  const pkg = existsSync(join(dir, 'package.json')) ? readJson(join(dir, 'package.json')) : {};
  const deps = Object.keys(pkg.dependencies ?? {}).filter((d) => d !== '@inkforum/sdk');
  const skip = new Set(['.git', '.github', '.vscode', '.idea', 'src', 'test', 'tests', 'tools', '.DS_Store', 'Thumbs.db', 'jsconfig.json', '.gitignore']);
  const out = `${m.id}-${m.version}.zip`;
  const entries = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const rel = relative(dir, p).split(sep).join('/');
      if (skip.has(name) || name.endsWith('.zip') || name === 'package-lock.json') continue;
      if (rel === 'node_modules' && !deps.length) continue;
      if (rel === 'node_modules/.bin') continue;
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) entries.push({ name: rel, data: readFileSync(p) });
    }
  };
  walk(dir);
  if (deps.length && !existsSync(join(dir, 'node_modules'))) console.log('\x1b[33m!\x1b[0m Bağımlılıklar kurulu değil; forum kurulumda npm install çalıştıracak. Paketlemeden önce "npm install --omit=dev" önerilir.');
  const buf = zip(entries);
  writeFileSync(join(dir, out), buf);
  ok(`${out} (${entries.length} dosya, ${(buf.length / 1024).toFixed(1)} KB)`);
  console.log('  Yönetim → Eklentiler → Eklenti yükle ekranından yükleyin.');
}

switch (cmd) {
  case 'init':
    init();
    break;
  case 'build':
    await build();
    break;
  case 'validate': {
    const m = validate(resolve(args[0] ?? '.'));
    ok(`${m.name} v${m.version} (${m.id}) geçerli.`);
    break;
  }
  case 'pack':
    pack();
    break;
  default:
    console.log(`inkforum-ext — InkForum eklenti aracı

  init <kimlik> [--name "Ad"]   yeni eklenti iskeleti
  build [klasör]                src/server.ts → server.mjs, src/public/* → public/ (esbuild)
  validate [klasör]             inkforum.json denetimi
  pack [klasör]                 yüklenebilir .zip üretir`);
    if (cmd && cmd !== 'help' && cmd !== '--help') process.exit(1);
}

