#!/usr/bin/env node
/**
 * Sürüm notları (iki dilli): İngilizce bölüm CHANGELOG.md'den, Türkçe bölüm CHANGELOG_tr.md'den alınır.
 * Türkçe kısım GitHub'da açılır bir bölümdür; yönetim paneli RELEASE_NOTES_TR_MARKER işaretine göre
 * yöneticinin diline uygun kısmı gösterir (packages/shared/src/updates.ts → pickReleaseNotes).
 * Bölüm yoksa ya da boşsa notlar önceki etiketten bu yana gelen commit mesajlarından üretilir.
 *
 *   node scripts/release/notes.mjs 1.2.0 > notes.md
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** packages/shared/src/updates.ts ile aynı olmalı */
const TR_MARKER = '<!-- inkforum:tr -->';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const version = (process.argv[2] ?? JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version).replace(/^v/, '');

function fromChangelog(name) {
  const file = join(root, name);
  if (!existsSync(file)) return '';
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const esc = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^## \\[${esc}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|(?![\\s\\S]))`, 'm').exec(text);
  return (m?.[1] ?? '').trim();
}

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

function fromCommits(lang) {
  const range = (() => {
    try {
      return `${git('describe', '--tags', '--abbrev=0', `v${version}^`)}..v${version}`;
    } catch {
      try {
        git('rev-parse', `v${version}`);
        return `v${version}`;
      } catch {
        return 'HEAD';
      }
    }
  })();
  let log;
  try {
    log = git('log', range, '--no-merges', '--pretty=format:%s');
  } catch {
    return '';
  }
  const titles =
    lang === 'tr'
      ? { feat: 'Yeni özellikler', fix: 'Düzeltmeler', security: 'Güvenlik', perf: 'Performans', other: 'Diğer iyileştirmeler', breaking: 'uyumluluğu bozan değişiklik' }
      : { feat: 'New features', fix: 'Fixes', security: 'Security', perf: 'Performance', other: 'Other improvements', breaking: 'breaking change' };
  const groups = { feat: [], fix: [], security: [], perf: [], other: [] };
  for (const line of log.split('\n').filter(Boolean)) {
    const m = /^(\w+)(?:\([^)]*\))?(!)?:\s*(.+)$/.exec(line);
    const type = m?.[1]?.toLowerCase();
    const text = (m?.[3] ?? line).replace(/^\w/, (c) => c.toUpperCase());
    if (type && ['chore', 'ci', 'test', 'build', 'docs', 'style', 'release'].includes(type)) continue;
    const key = type === 'feat' ? 'feat' : type === 'fix' ? 'fix' : type === 'security' || type === 'sec' ? 'security' : type === 'perf' ? 'perf' : 'other';
    groups[key].push(`- ${text}${m?.[2] ? ` **(${titles.breaking})**` : ''}`);
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length)
    .map(([key, items]) => `### ${titles[key]}\n\n${items.join('\n')}`)
    .join('\n\n');
}

const image = `ghcr.io/vokartz/inkforum:${version}`;
const en = fromChangelog('CHANGELOG.md') || fromCommits('en') || '- Bug fixes and improvements.';
const tr = fromChangelog('CHANGELOG_tr.md') || fromCommits('tr') || '- Hata düzeltmeleri ve iyileştirmeler.';

process.stdout.write(
  `${en}\n\n---\n\n` +
    `**Updating:** install with one click from Admin → Updates; a database backup is taken automatically first.\n` +
    `Docker: \`docker compose pull && docker compose up -d\` · Image: \`${image}\`\n\n` +
    `${TR_MARKER}\n<details>\n<summary>Türkçe sürüm notları</summary>\n\n${tr}\n\n---\n\n` +
    `**Güncelleme:** Yönetim → Güncellemeler ekranından tek tıkla kurulur. Kurulumdan önce veritabanı yedeği otomatik alınır.\n` +
    `Docker: \`docker compose pull && docker compose up -d\` · İmaj: \`${image}\`\n\n</details>\n`,
);
