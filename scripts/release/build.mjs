#!/usr/bin/env node
/**
 * InkForum sürüm paketi.
 *
 * Sunucu tek dosyada birleştirilip küçültülür (kurulum ve imaj küçük kalsın), arayüz SvelteKit
 * derlemesinden gelir. Kaynak kodun tamamı bu depoda AGPL-3.0 ile açıktır. Çıktı:
 *
 *   release/inkforum/            → Docker imajının ve sunucu paketinin içeriği
 *     server.mjs  cli.mjs  updater.mjs  web/  package.json  forum.release  BUILD  LICENSE
 *   release/dist/inkforum-<sürüm>.tar.gz   (+ SHA256SUMS)
 *
 * Kullanım (önce: INKFORUM_RELEASE=1 pnpm build):
 *   node scripts/release/build.mjs [--no-archive] [--with-modules]
 *     --with-modules  node_modules'u da kurar ve <platform>-<arch> paketi üretir
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = new Set(process.argv.slice(2));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const out = join(root, 'release', 'inkforum');
const dist = join(root, 'release', 'dist');

const serverDist = join(root, 'apps/server/dist');
const webBuild = join(root, 'apps/web/build');
for (const [p, hint] of [
  [join(serverDist, 'main.js'), 'apps/server'],
  [join(webBuild, 'handler.js'), 'apps/web'],
]) {
  if (!existsSync(p)) {
    console.error(`✗ ${relative(root, p)} yok. Önce derleyin: INKFORUM_RELEASE=1 pnpm build (${hint})`);
    process.exit(1);
  }
}

const readPkg = (dir) => JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
const serverPkg = readPkg('apps/server');
const dbPkg = readPkg('packages/db');

/** Çalışma anında dosya okuyan ya da yerel (native) bileşen içeren paketler paketlenmez, npm ile kurulur. */
const runtimeDeps = {
  '@node-rs/argon2': serverPkg.dependencies['@node-rs/argon2'],
  '@phosphor-icons/core': serverPkg.dependencies['@phosphor-icons/core'],
  '@twemoji/svg': serverPkg.dependencies['@twemoji/svg'],
  pg: dbPkg.dependencies.pg,
};
const optionalDeps = { sharp: '^0.34.4' };
const external = [
  ...Object.keys(runtimeDeps),
  ...Object.keys(optionalDeps),
  'better-sqlite3',
  '@electric-sql/pglite',
  // Nest'in isteğe bağlı modülleri (kullanılmıyor)
  '@nestjs/microservices',
  '@nestjs/microservices/*',
  '@nestjs/websockets',
  '@nestjs/websockets/*',
  '@fastify/static',
  'class-transformer',
  'class-transformer/*',
  'class-validator',
  'pg-native',
];

/** Önceki çıktıyı siler; bağlantılar (symlink/junction) hedefleri izlenmeden kaldırılır */
function clean(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) {
      try {
        unlinkSync(p);
      } catch {
        rmdirSync(p); // Windows dizin bağlantısı (junction)
      }
    }
    else if (st.isDirectory()) clean(p);
  }
  rmSync(dir, { recursive: true, force: true });
}

console.log(`▶ InkForum v${version} sürüm paketi hazırlanıyor`);
clean(out);
mkdirSync(out, { recursive: true });

const banner = [
  `/*! InkForum v${version} — AGPL-3.0-only — https://github.com/vokartz/inkforum */`,
  "import { createRequire as __inkRequire } from 'node:module';",
  'const require = __inkRequire(import.meta.url);',
].join('\n');

const entries = [
  ['main.js', 'server.mjs'],
  ['cli.js', 'cli.mjs'],
  ['updater/updater.js', 'updater.mjs'],
];
for (const [from, to] of entries) {
  await build({
    entryPoints: [join(serverDist, from)],
    outfile: join(out, to),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    minify: true,
    keepNames: true, // Nest bağımlılık çözümü ve günlükler sınıf adlarını kullanır
    sourcemap: false,
    legalComments: 'none',
    external,
    banner: { js: banner },
    logLevel: 'warning',
  });
  console.log(`  ✓ ${to} (${(statSync(join(out, to)).size / 1024).toFixed(0)} KB)`);
}

// Arayüz: kaynak haritaları çıkarılır
cpSync(webBuild, join(out, 'web'), { recursive: true, filter: (src) => !src.endsWith('.map') });
console.log('  ✓ web/');

const releasePkg = {
  name: 'inkforum',
  version,
  private: true,
  type: 'module',
  description: 'InkForum — topluluk yazılımı',
  license: 'AGPL-3.0-only',
  engines: { node: '>=22.13' },
  scripts: { start: 'node --env-file-if-exists=.env server.mjs', migrate: 'node --env-file-if-exists=.env cli.mjs migrate' },
  dependencies: runtimeDeps,
  optionalDependencies: optionalDeps,
};
writeFileSync(join(out, 'package.json'), `${JSON.stringify(releasePkg, null, 2)}\n`);
writeFileSync(join(out, 'forum.release'), `${version}\n`);
let commit = process.env.GITHUB_SHA ?? '';
if (!commit) {
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    commit = '';
  }
}
writeFileSync(join(out, 'BUILD'), `${commit.slice(0, 12) || 'local'} ${new Date().toISOString().slice(0, 10)}\n`);
for (const f of ['LICENSE', 'CHANGELOG.md', 'CHANGELOG_tr.md']) if (existsSync(join(root, f))) cpSync(join(root, f), join(out, f));
cpSync(join(root, '.env.example'), join(out, '.env.example'));
// Arayüz ve e-posta çevirileri (sunucu I18nService bunları <kök>/i18n klasöründen okur)
cpSync(join(root, 'packages/shared/i18n'), join(out, 'i18n'), { recursive: true });

if (args.has('--with-modules')) {
  console.log('  … npm install --omit=dev');
  execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: out, stdio: 'inherit', shell: process.platform === 'win32' });
}

if (!args.has('--no-archive')) {
  mkdirSync(dist, { recursive: true });
  const name = args.has('--with-modules') ? `inkforum-${version}-${process.platform}-${process.arch}.tar.gz` : `inkforum-${version}.tar.gz`;
  // Göreli yollar: GNU tar "C:\…" biçimini uzak sunucu adresi sanar
  execFileSync('tar', ['-czf', `dist/${name}`, 'inkforum'], { cwd: join(root, 'release'), stdio: 'inherit' });
  const sums = readdirSync(dist)
    .filter((f) => f.endsWith('.tar.gz'))
    .map((f) => `${createHash('sha256').update(readFileSync(join(dist, f))).digest('hex')}  ${f}`);
  writeFileSync(join(dist, 'SHA256SUMS'), `${sums.join('\n')}\n`);
  console.log(`  ✓ ${name} (${(statSync(join(dist, name)).size / 1024 / 1024).toFixed(1)} MB) + SHA256SUMS`);
}
console.log(`✔ Hazır: ${relative(root, out)}`);
