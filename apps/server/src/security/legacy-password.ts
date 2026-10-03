import { createHash, timingSafeEqual } from 'node:crypto';

const md5 = (s: string | Buffer) => createHash('md5').update(s).digest();
const md5hex = (s: string | Buffer) => createHash('md5').update(s).digest('hex');
const sha1hex = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex');
const b64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');
const enc = (s: string) => Buffer.from(s).toString('base64url');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const phpLower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
const decodeNumeric = (s: string) => s.replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)));

const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function encode64(input: Buffer, count: number): string {
  let out = '';
  let i = 0;
  do {
    let value = input[i++]!;
    out += ITOA64[value & 0x3f];
    if (i < count) value |= input[i]! << 8;
    out += ITOA64[(value >> 6) & 0x3f];
    if (i++ >= count) break;
    if (i < count) value |= input[i]! << 16;
    out += ITOA64[(value >> 12) & 0x3f];
    if (i++ >= count) break;
    out += ITOA64[(value >> 18) & 0x3f];
  } while (i < count);
  return out;
}

export function phpassVerify(password: string, hash: string): boolean {
  if (hash.length !== 34 || !/^\$[HP]\$/.test(hash)) return false;
  const countLog2 = ITOA64.indexOf(hash[3]!);
  if (countLog2 < 7 || countLog2 > 30) return false;
  const salt = hash.slice(4, 12);
  const pw = Buffer.from(password, 'utf8');
  let h = md5(Buffer.concat([Buffer.from(salt, 'latin1'), pw]));
  for (let n = 1 << countLog2; n > 0; n--) h = md5(Buffer.concat([h, pw]));
  return safeEqual(hash.slice(0, 12) + encode64(h, 16), hash);
}

export function ipsClean(pw: string, backslash = false): string {
  let s = pw
    .replace(/&#032;/g, ' ')
    .replace(/\r\n|\n\r|\r/g, '\n')
    .replace(/&/g, '&amp;')
    .replace(/<!--/g, '&#60;&#33;--')
    .replace(/-->/g, '--&#62;')
    .replace(/<script/gi, '&#60;script')
    .replace(/>/g, '&gt;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br />')
    .replace(/\$/g, '&#036;')
    .replace(/!/g, '&#33;')
    .replace(/'/g, '&#39;');
  if (backslash) s = s.replace(/\\/g, '&#092;');
  return s;
}

function phpbbInput(pw: string): string {
  return pw
    .normalize('NFC')
    .replace(/\r\n|\r/g, '\n')
    .replace(/[\0\ufeff]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

type BcryptVerify = (opts: { password: string; hash: string }) => Promise<boolean>;
let bcryptImpl: BcryptVerify | null | undefined;

async function bcryptVerify(password: string, hash: string): Promise<boolean> {
  if (bcryptImpl === undefined) {
    try {
      const mod = await import('hash-wasm');
      bcryptImpl = mod.bcryptVerify as BcryptVerify;
    } catch {
      bcryptImpl = null;
    }
  }
  if (!bcryptImpl) throw new Error('bcrypt doğrulaması için hash-wasm gerekli.');
  const normalized = hash.replace(/^\$2[axy]\$/, '$2b$');
  const bytes = Buffer.from(password, 'utf8');
  const pw = bytes.length > 72 ? bytes.subarray(0, 72).toString('utf8') : password;
  try {
    return await bcryptImpl({ password: pw, hash: normalized });
  } catch {
    return false;
  }
}

async function argonVerify(password: string, hash: string): Promise<boolean> {
  try {
    const mod = await import('@node-rs/argon2');
    return await mod.verify(hash, password);
  } catch {
    try {
      const mod = await import('hash-wasm');
      return await mod.argon2Verify({ password, hash });
    } catch {
      return false;
    }
  }
}

async function phpbbCheck(stored: string, pw: string): Promise<boolean> {
  const h = stored.startsWith('$CP$') ? stored.slice(4) : stored;
  if (/^\$[HP]\$/.test(h)) return phpassVerify(pw, h);
  if (/^\$2[abxy]\$/.test(h)) return bcryptVerify(pw, h);
  if (/^\$argon2/.test(h)) return argonVerify(pw, h);
  if (/^[0-9a-f]{32}$/i.test(h)) return safeEqual(md5hex(pw), h.toLowerCase());
  if (/^[0-9a-f]{40}$/i.test(h)) return safeEqual(sha1hex(pw), h.toLowerCase());
  return false;
}

export function isLegacyHash(hash: string): boolean {
  return /^\$(2[abxy]|H|P|legacy)\$/.test(hash);
}

export async function verifyLegacy(hash: string, password: string): Promise<boolean> {
  if (/^\$2[abxy]\$/.test(hash)) return bcryptVerify(password, hash);
  if (/^\$[HP]\$/.test(hash)) return phpassVerify(password, hash);
  if (!hash.startsWith('$legacy$')) return false;
  const [, , scheme, a = '', b = ''] = hash.split('$');
  switch (scheme) {
    case 'smf1':
      return safeEqual(sha1hex(phpLower(b64(a)) + password), b.toLowerCase());
    case 'smf2': {
      const name = b64(a);
      const stored = b64(b);
      if (/^[0-9a-f]{40}$/i.test(stored)) return safeEqual(sha1hex(phpLower(name) + password), stored.toLowerCase());
      const unicodeName = decodeNumeric(name).normalize('NFC').toLowerCase();
      for (const n of new Set([phpLower(name), unicodeName])) if (await bcryptVerify(n + password, stored)) return true;
      return false;
    }
    case 'phpbb': {
      const stored = b64(a);
      for (const pw of new Set([phpbbInput(password), phpbbInput(password.trim()), password])) if (await phpbbCheck(stored, pw)) return true;
      return false;
    }
    case 'md5salt':
      return safeEqual(md5hex(md5hex(b64(a)) + md5hex(password)), b.toLowerCase());
    case 'xfcore': {
      const [fn, stored = ''] = b.split('.');
      if (fn !== 'sha256' && fn !== 'sha1') return false;
      const h = (x: string) => createHash(fn).update(x, 'utf8').digest('hex');
      return safeEqual(h(h(password) + b64(a)), stored.toLowerCase());
    }
    case 'ipsmd5': {
      const salt = b64(a);
      for (const pw of new Set([ipsClean(password), ipsClean(password, true), password])) {
        if (safeEqual(md5hex(md5hex(salt) + md5hex(pw)), b.toLowerCase())) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

export const legacyHash = {
  smf1: (storedUsername: string, sha1: string) => `$legacy$smf1$${enc(storedUsername)}$${sha1.toLowerCase()}`,
  smf2: (storedUsername: string, stored: string) => `$legacy$smf2$${enc(storedUsername)}$${enc(stored)}`,
  phpbb: (stored: string) => `$legacy$phpbb$${enc(stored)}$`,
  md5salt: (salt: string, hash: string) => `$legacy$md5salt$${enc(salt)}$${hash.toLowerCase()}`,
  ipsmd5: (salt: string, hash: string) => `$legacy$ipsmd5$${enc(salt)}$${hash.toLowerCase()}`,
  xfcore: (salt: string, hash: string, fn: 'sha256' | 'sha1') => `$legacy$xfcore$${enc(salt)}$${fn}.${hash.toLowerCase()}`,
};
