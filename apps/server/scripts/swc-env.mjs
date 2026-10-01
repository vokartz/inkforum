// SWC'nin yerel (native) modül önbelleğini proje içine yönlendirir.
// Bazı Windows kurulumlarında %LOCALAPPDATA%\swc klasörünün izinleri SWC'nin yüklenmesini engelliyor.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
if (!process.env.SWC_NATIVE_BINDING_CACHE) {
  const dir = resolve(root, 'node_modules/.cache/swc');
  mkdirSync(dir, { recursive: true });
  process.env.SWC_NATIVE_BINDING_CACHE = dir;
}
