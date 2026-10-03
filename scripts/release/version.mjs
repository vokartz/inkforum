#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkgFile = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
const arg = process.argv[2];
if (!arg) {
  console.error('Kullanım: pnpm release:version patch|minor|major|<sürüm>');
  process.exit(1);
}

const [maj, min, pat] = pkg.version.split('-')[0].split('.').map(Number);
const next =
  arg === 'major' ? `${maj + 1}.0.0` : arg === 'minor' ? `${maj}.${min + 1}.0` : arg === 'patch' ? `${maj}.${min}.${pat + 1}` : arg.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(next)) {
  console.error(`Geçersiz sürüm: ${next}`);
  process.exit(1);
}

pkg.version = next;
writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);

const today = new Date().toISOString().slice(0, 10);
for (const [name, unreleased] of [
  ['CHANGELOG.md', 'Unreleased'],
  ['CHANGELOG_tr.md', 'Yayımlanmamış'],
]) {
  const clFile = join(root, name);
  if (!existsSync(clFile)) continue;
  let cl = readFileSync(clFile, 'utf8').replace(/\r\n/g, '\n');
  const head = new RegExp(`^## \\[${unreleased}\\][^\\n]*\\n`, 'm');
  if (head.test(cl)) cl = cl.replace(head, `## [${unreleased}]\n\n## [${next}] - ${today}\n`);
  else cl = cl.replace(/^(# [^\n]*\n)/, `$1\n## [${next}] - ${today}\n\n`);
  writeFileSync(clFile, cl);
}

console.log(`✔ Sürüm ${next}. Sonraki adımlar:
  1. CHANGELOG.md (İngilizce) ve CHANGELOG_tr.md (Türkçe) içinde "## [${next}]" bölümlerini gözden geçirin
     (boş bırakılırsa notlar commit mesajlarından üretilir)
  2. git add -A && git commit -m "release: v${next}"
  3. git tag v${next} && git push && git push origin v${next}
GitHub Actions paketi derler, Docker imajını ghcr.io/vokartz/inkforum'a yükler ve
vokartz/inkforum deposunda sürümü notlarıyla yayımlar. Kurulu forumlar yeni sürümü otomatik görür.`);
