#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCALES = ['en'];
const outDir = join(root, 'packages/shared/i18n');

const SOURCES = [
  { dir: 'apps/web/src', exts: ['.svelte', '.ts'], skip: [/[\\/]components[\\/]ui[\\/]/, /paraglide/, /\.test\.ts$/, /i18n\.svelte\.ts$/, /\.d\.ts$/] },
  { dir: 'packages/shared/src', exts: ['.ts'], skip: [/\.test\.ts$/, /[\\/]i18n\.ts$/] },
  { dir: 'apps/server/src', exts: ['.ts'], skip: [/\.test\.ts$/, /[\\/]testing[\\/]/, /[\\/]updater[\\/]/, /cli\.ts$/] },
];

function walk(dir, exts, skip, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, skip, out);
    else if (exts.some((x) => p.endsWith(x)) && !skip.some((re) => re.test(p))) out.push(p);
  }
  return out;
}

function unescape(body) {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_m, c) => {
    if (c[0] === 'u' && c.length > 1) return String.fromCodePoint(parseInt(c.replace(/[u{}]/g, ''), 16));
    if (c[0] === 'x' && c.length === 3) return String.fromCharCode(parseInt(c.slice(1), 16));
    return { n: '\n', r: '\r', t: '\t', 0: '\0' }[c] ?? c;
  });
}

function scanJs(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      i = src.indexOf('\n', i);
      if (i === -1) break;
      continue;
    }
    if (c === '/' && d === '*') {
      i = src.indexOf('*/', i + 2);
      if (i === -1) break;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      out.push({ text: unescape(src.slice(i + 1, j)), at: i, template: false, before: src.slice(Math.max(0, i - 40), i) });
      i = j + 1;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let text = '';
      let k = 0;
      let simple = true;
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') {
          text += unescape(src.slice(j, j + 2));
          j += 2;
          continue;
        }
        if (src[j] === '$' && src[j + 1] === '{') {
          let depth = 1;
          let m = j + 2;
          while (m < n && depth) {
            if (src[m] === '{') depth++;
            else if (src[m] === '}') depth--;
            else if (src[m] === '`') simple = false;
            m++;
          }
          text += `{${k++}}`;
          j = m;
          continue;
        }
        text += src[j];
        j++;
      }
      if (simple) out.push({ text, at: i, template: true });
      i = j + 1;
      continue;
    }
    if (c === '/' && /[=(,:!&|?;{}[\n]\s*$/.test(src.slice(Math.max(0, i - 3), i))) {
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') j += 2;
        else if (src[j] === '[') {
          inClass = true;
          j++;
        } else if (src[j] === ']') {
          inClass = false;
          j++;
        }
        else if (src[j] === '/' && !inClass) break;
        else j++;
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

const TR = /[çğıöşüÇĞİÖŞÜâîû]/;
const TR_WORDS = /\b(ve|bir|bu|ile|için|olarak|yok|var|değil|daha|veya|gibi|tüm|yeni|kayıt|giriş|üye|konu|mesaj|bölüm|ayar|sil|kaydet|vazgeç|yönetim|forum|sayfa|seçin|girin|olmalı|bulunamadı|başarı|hata|kapalı|açık)\b/i;

function human(s) {
  const t = s.trim();
  if (t.length < 2 || t.length > 2000) return false;
  if (!/\p{L}/u.test(t)) return false;
  if (/\{\w+, plural,/.test(t)) return true;
  if (/^(https?:|\/|\.\/|\.\.\/|#|@|data:|mailto:|[a-z]+:\/\/)/.test(t)) return false;
  if (/^[\w.-]+\.(ts|js|svelte|json|png|svg|css|mjs|html)$/.test(t)) return false;
  if (/^[a-z0-9_.:-]+$/.test(t)) return false;
  if (/^[a-z0-9:_\-[\]/.()%#!&>*~@=,'"\s]+$/.test(t) && !TR.test(t) && !TR_WORDS.test(t)) return false;
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA|VACUUM|BEGIN|COMMIT|WHERE|ORDER BY|NOT \()\b/.test(t)) return false;
  if (/[<>]/.test(t) && /<\/?[a-z][^>]*>/i.test(t) && !TR.test(t)) return false;
  if (/^[A-Z][A-Z0-9_]+$/.test(t)) return false;
  if (/^\$lib\/|\$[a-z_]+\[|=>|->|function\s*\(|;\s*\/\//i.test(t)) return false;
  if (/^(From|To|Subject|Content-Type|Sitemap|Disallow|Allow|User-agent|SQLite format)\b/m.test(t)) return false;
  if (!/\s/.test(t) && /:/.test(t) && !TR.test(t)) return false;
  return TR.test(t) || TR_WORDS.test(t) || (/^[A-ZÇĞİÖŞÜ]/.test(t) && /\s/.test(t) && /[aeıioöuü]/i.test(t));
}

const LABEL_FIELD = /(?:\b(?:label|title|description|hint|name|placeholder|text|summary|heading|confirmLabel|cancelLabel|emptyText|tagline|caption|l|d)\s*:|\[)\s*$/;

const T_CALL = /(?<![\w$.])t\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\$]|\\.)*`)/g;

const keys = new Map();
function add(text, file) {
  const k = text.replace(/\r\n/g, '\n');
  if (!k.trim()) return;
  if (/<\/?(p|a|b|strong|em|br|div|span|li|ul|h\d)\b[^>]*>/i.test(k)) {
    for (const seg of k.split(/<[^>]+>|\{\d+\}/)) {
      const t = seg.trim();
      if (t && /\p{L}/u.test(t) && !keys.has(t)) keys.set(t, file);
    }
    return;
  }
  if (!keys.has(k)) keys.set(k, file);
}

for (const src of SOURCES) {
  for (const file of walk(join(root, src.dir), src.exts, src.skip)) {
    const code = readFileSync(file, 'utf8');
    const rel = relative(root, file).replace(/\\/g, '/');
    const web = src.dir === 'apps/web/src';
    for (const m of code.matchAll(T_CALL)) add(unescape(m[1].slice(1, -1)), rel);
    const scripts = file.endsWith('.svelte') ? [...code.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]) : [code];
    if (file.endsWith('.svelte')) for (const m of code.matchAll(/\{#each\s+(\[[\s\S]*?\])\s+(?:as const\s+)?as\b/g)) scripts.push(m[1]);
    for (const s of scripts) {
      for (const lit of scanJs(s)) {
        const labelField = !!lit.before && LABEL_FIELD.test(lit.before) && /^\p{Lu}[\p{L}\p{N} .,'’()/&+-]*$/u.test(lit.text.trim());
        if (!human(lit.text) && !labelField) continue;
        if (web || !lit.text.includes('${')) add(lit.text, rel);
      }
    }
  }
}

const sorted = [...keys.keys()].sort((a, b) => a.localeCompare(b, 'tr'));
const srcArg = process.argv.indexOf('--sources');
if (srcArg > 0 && process.argv[srcArg + 1]) writeFileSync(process.argv[srcArg + 1], JSON.stringify(Object.fromEntries(sorted.map((k) => [k, keys.get(k)])), null, 1));
const check = process.argv.includes('--check');
let missingTotal = 0;
for (const l of LOCALES) {
  const file = join(outDir, `${l}.json`);
  let old;
  try {
    old = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    old = {};
  }
  const next = {};
  let missing = 0;
  for (const k of sorted) {
    next[k] = typeof old[k] === 'string' ? old[k] : '';
    if (!next[k]) missing++;
  }
  missingTotal += missing;
  if (!check) writeFileSync(file, `${JSON.stringify(next, null, 1)}\n`);
  console.log(`${l}: ${sorted.length - missing}/${sorted.length} çevrildi${missing ? ` (${missing} eksik)` : ''}`);
}
console.log(`Toplam ${sorted.length} metin.`);
if (check && missingTotal) process.exit(1);
