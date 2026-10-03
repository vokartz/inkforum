import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { isLegacyHash, verifyLegacy } from './legacy-password.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

interface ArgonBackend {
  name: string;
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

@Injectable()
export class PasswordHasher {
  private readonly logger = new Logger('PasswordHasher');
  private readonly semaphore = new Semaphore(2);
  private backend: ArgonBackend | null | undefined;

  private async argon(): Promise<ArgonBackend | null> {
    if (this.backend !== undefined) return this.backend;
    try {
      const mod = await import('@node-rs/argon2');
      this.backend = {
        name: '@node-rs/argon2',
        hash: (pw) => mod.hash(pw, { ...ARGON, algorithm: 2 }),
        verify: (h, pw) => mod.verify(h, pw),
      };
    } catch {
      try {
        const mod = await import('hash-wasm');
        this.backend = {
          name: 'hash-wasm',
          hash: (pw) =>
            mod.argon2id({
              password: pw,
              salt: randomBytes(16),
              parallelism: ARGON.parallelism,
              iterations: ARGON.timeCost,
              memorySize: ARGON.memoryCost,
              hashLength: 32,
              outputType: 'encoded',
            }),
          verify: (h, pw) => mod.argon2Verify({ password: pw, hash: h }),
        };
      } catch {
        this.backend = null;
      }
    }
    this.logger.log(`Şifre özetleme: ${this.backend ? `argon2id (${this.backend.name})` : 'scrypt'}`);
    return this.backend;
  }

  async hash(password: string): Promise<string> {
    return this.semaphore.run(async () => {
      const argon = await this.argon();
      if (argon) return argon.hash(password);
      const salt = randomBytes(16);
      const key = await scrypt(password, salt, 32, SCRYPT);
      return `$scrypt$ln=15,r=8,p=1$${salt.toString('base64url')}$${key.toString('base64url')}`;
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return this.semaphore.run(async () => {
      if (hash.startsWith('$argon2')) {
        const argon = await this.argon();
        if (!argon) throw new Error('argon2 özeti doğrulanamıyor: argon2 uygulaması bulunamadı.');
        try {
          return await argon.verify(hash, password);
        } catch {
          return false;
        }
      }
      if (isLegacyHash(hash)) return verifyLegacy(hash, password);
      if (hash.startsWith('$scrypt$')) {
        const [, , params, saltB64, keyB64] = hash.split('$');
        const ln = Number(/ln=(\d+)/.exec(params ?? '')?.[1] ?? 15);
        const r = Number(/r=(\d+)/.exec(params ?? '')?.[1] ?? 8);
        const p = Number(/p=(\d+)/.exec(params ?? '')?.[1] ?? 1);
        const expected = Buffer.from(keyB64 ?? '', 'base64url');
        const key = await scrypt(password, Buffer.from(saltB64 ?? '', 'base64url'), expected.length, {
          N: 2 ** ln,
          r,
          p,
          maxmem: SCRYPT.maxmem,
        });
        return key.length === expected.length && timingSafeEqual(key, expected);
      }
      return false;
    });
  }

  async needsRehash(hash: string): Promise<boolean> {
    const argon = await this.argon();
    if (!argon) return !hash.startsWith('$scrypt$');
    return !hash.startsWith(`$argon2id$v=19$m=${ARGON.memoryCost},t=${ARGON.timeCost},p=${ARGON.parallelism}$`);
  }
}
