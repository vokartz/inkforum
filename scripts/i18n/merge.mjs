#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const [dir, ...flags] = process.argv.slice(2);
if (!dir) {
  console.error('Kullanım: node scripts/i18n/merge.mjs <klasör> [--dry]');
  process.exit(1);
}
const dry = flags.includes('--dry');
const catalogDir = join(root, 'packages/shared/i18n');

function placeholders(s) {
  const names = new Set();
  const src = s.replace(/\{\{\s*[\w.]+\s*\}\}/g, '');
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') {
      if (depth === 0) {
        const m = /^\{\s*([\w]+)\s*(?:[,}])/.exec(src.slice(i));
        if (m) names.add(m[1]);
      }
      depth++;
    } else if (c === '}') depth = Math.max(0, depth - 1);
  }
  return [...names].sort().join('|');
}
const bag = (s, re) => (s.match(re) ?? []).map((x) => x.toLowerCase()).sort().join('|');
const mustache = (s) => bag(s, /\{\{\s*[\w.]+\s*\}\}/g);
const html = (s) => bag(s, /<\/?(?:a|b|i|u|s|em|strong|br|p|code|span|div|ul|ol|li|small|kbd|h[1-6]|img|pre|blockquote|table|tr|td|th|sup|sub|hr|mark)(?=[\s>/])/gi);
const bbcode = (s) => bag(s, /\[\/?(?:b|i|u|s|url|img|quote|code|list|\*|color|size|center|spoiler|h[2-4]|mention|table|tr|td)\b/gi);

function check(source, value) {
  if (typeof value !== 'string' || !value.trim()) return 'boş';
  const plain = (x) => x.replace(/\{[^{}]*\}|<[^>]*>|\[[^\]]*\]|https?:\/\/\S+|GERİ YÜKLE/g, ' ');
  if (/[ğışĞİŞ]/.test(plain(value))) return 'Türkçe kalmış';
  if (value === source && /[a-zçğıöşü]{2,}/i.test(plain(source)) && /[çğıöşüÇĞİÖŞÜ]|\b(ve|bir|için|ile|bu|olarak)\b/.test(plain(source))) return 'çevrilmemiş';
  if (placeholders(source) !== placeholders(value)) return `yer tutucu (${placeholders(source)} ≠ ${placeholders(value)})`;
  if (mustache(source) !== mustache(value)) return '{{değişken}}';
  if (html(source) !== html(value)) return 'HTML';
  if (bbcode(source) !== bbcode(value)) return 'BBCode';
  const bal = (x) => [...x].reduce((n, c) => n + (c === '{' ? 1 : c === '}' ? -1 : 0), 0);
  if (bal(value) !== 0) return 'parantez dengesi';
  return null;
}

function repairJson(text) {
  let out = '';
  let inString = false;
  let isKey = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!inString) {
      if (c === '"') inString = true;
      else if (c === ':') isKey = false;
      else if (c === ',' || c === '{') isKey = true;
      out += c;
      continue;
    }
    if (c === '\\') {
      out += c + (text[i + 1] ?? '');
      i++;
      continue;
    }
    if (c === '"') {
      const rest = text.slice(i + 1);
      const ends = isKey ? /^\s*:/.test(rest) : /^\s*(,\s*"|\}\s*$|\}\s*,)/.test(rest);
      if (ends) {
        inString = false;
        out += c;
      } else out += '\\"';
      continue;
    }
    out += c === '\n' ? '\\n' : c;
  }
  return JSON.parse(out);
}

function readChunk(path) {
  const text = readFileSync(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch {
  }
  try {
    return repairJson(text);
  } catch {
    const cut = text.lastIndexOf('","');
    const tail = text.slice(0, cut + 1).replace(/,\s*"[^"]*"\s*:\s*"(?:[^"\\]|\\.)*$/, '');
    return repairJson(`${tail}}`);
  }
}

let total = 0;
for (const lang of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && /^[a-z]{2}$/.test(d.name)).map((d) => d.name)) {
  const catalogPath = join(catalogDir, `${lang}.json`);
  if (!existsSync(catalogPath)) continue;
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  let ok = 0;
  const rejected = [];
  for (const file of readdirSync(join(dir, lang)).filter((f) => f.endsWith('.json'))) {
    let data;
    try {
      data = readChunk(join(dir, lang, file));
    } catch (err) {
      console.warn(`${lang}/${file}: geçersiz JSON (${err.message})`);
      continue;
    }
    for (const [key, value] of Object.entries(data)) {
      if (!(key in catalog)) continue;
      const problem = check(key, value);
      if (problem) rejected.push({ file, key, value, problem });
      else {
        catalog[key] = value;
        ok++;
      }
    }
  }
  const filled = Object.values(catalog).filter(Boolean).length;
  console.log(`${lang}: ${ok} çeviri alındı, ${rejected.length} reddedildi · katalog ${filled}/${Object.keys(catalog).length}`);
  for (const r of rejected.slice(0, 8)) console.log(`   ✗ ${r.problem}: ${JSON.stringify(r.key).slice(0, 80)} → ${JSON.stringify(r.value).slice(0, 80)}`);
  if (rejected.length) writeFileSync(join(dir, `${lang}.rejected.json`), JSON.stringify(rejected, null, 1));
  if (!dry) writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 1)}\n`);
  total += ok;
}
console.log(dry ? `(deneme) ${total} çeviri` : `${total} çeviri kataloglara yazıldı.`);
