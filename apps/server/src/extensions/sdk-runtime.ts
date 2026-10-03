import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SDK_RUNTIME = `const RAW = Symbol.for('inkforum.rawHtml');
export function defineExtension(def) { return def; }
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
export function raw(value) { return { [RAW]: true, value, toString: () => value }; }
function part(v) {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (typeof v === 'object' && v[RAW]) return v.value;
  return escapeHtml(v);
}
export function html(strings, ...values) {
  let out = strings[0] ?? '';
  values.forEach((v, i) => (out += part(v) + (strings[i + 1] ?? '')));
  return Object.assign(new String(out), { [RAW]: true, value: out });
}
`;

export function ensureSdkRuntime(root: string, coreVersion: string): void {
  const dir = join(root, 'node_modules', '@inkforum', 'sdk');
  const pkgFile = join(dir, 'package.json');
  const pkg = JSON.stringify({ name: '@inkforum/sdk', version: '1.0.0', type: 'module', main: './index.js', exports: { '.': './index.js', './client': './client.js' }, inkforumRuntime: coreVersion }, null, 2);
  try {
    if (existsSync(pkgFile) && readFileSync(pkgFile, 'utf8') === pkg && readFileSync(join(dir, 'index.js'), 'utf8') === SDK_RUNTIME) return;
  } catch {
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.js'), SDK_RUNTIME);
  writeFileSync(join(dir, 'client.js'), 'export {};\n');
  writeFileSync(pkgFile, pkg);
}
