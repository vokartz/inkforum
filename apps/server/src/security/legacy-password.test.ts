import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { legacyHash, phpassVerify, verifyLegacy } from './legacy-password.js';

const md5 = (s: string) => createHash('md5').update(s).digest('hex');
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

describe('legacy passwords', () => {
  it('verifies SMF 2.0 sha1(lower(username)+password)', async () => {
    const h = legacyHash.smf1('Ali', sha1('ali' + 'gizli123'));
    expect(await verifyLegacy(h, 'gizli123')).toBe(true);
    expect(await verifyLegacy(h, 'yanlis')).toBe(false);
  });

  it('verifies MyBB / IPS md5(md5(salt)+md5(password))', async () => {
    expect(await verifyLegacy(legacyHash.md5salt('aB3dE', md5(md5('aB3dE') + md5('parola'))), 'parola')).toBe(true);
    expect(await verifyLegacy(legacyHash.ipsmd5('xyz12', md5(md5('xyz12') + md5('a&amp;b'))), 'a&b')).toBe(true);
  });

  it('verifies phpass ($H$) hashes from phpBB 3.0', () => {
    expect(phpassVerify('test12345', '$P$9IQRaTwmfeRo7ud9Fh4E2PdI0S3r.L0')).toBe(true);
    expect(phpassVerify('test1234', '$P$9IQRaTwmfeRo7ud9Fh4E2PdI0S3r.L0')).toBe(false);
  });

  it('verifies bcrypt ($2y$) hashes', async () => {
    const { bcrypt } = await import('hash-wasm');
    const hash = await bcrypt({ password: 'parola', salt: Buffer.alloc(16, 7), costFactor: 4, outputType: 'encoded' });
    const php = hash.replace(/^\$2b\$/, '$2y$');
    expect(await verifyLegacy(php, 'parola')).toBe(true);
    expect(await verifyLegacy(php, 'Parola')).toBe(false);
  });
});

describe('legacy passwords (forum specifics)', () => {
  it('verifies phpBB hashes with the input transform', async () => {
    const { bcrypt } = await import('hash-wasm');
    const stored = (await bcrypt({ password: 'a&amp;b', salt: Buffer.alloc(16, 3), costFactor: 4, outputType: 'encoded' })).replace(/^\$2b\$/, '$2y$');
    const { legacyHash: lh } = await import('./legacy-password.js');
    expect(await verifyLegacy(lh.phpbb(stored), 'a&b')).toBe(true);
    expect(await verifyLegacy(lh.phpbb(`$CP$${createHash('md5').update('eski').digest('hex')}`), 'eski')).toBe(true);
  });

  it('verifies SMF 2.1 bcrypt with the lower-cased username prefix', async () => {
    const { bcrypt } = await import('hash-wasm');
    const stored = await bcrypt({ password: 'ali' + 'Parola1', salt: Buffer.alloc(16, 9), costFactor: 4, outputType: 'encoded' });
    expect(await verifyLegacy(legacyHash.smf2('Ali', stored), 'Parola1')).toBe(true);
    expect(await verifyLegacy(legacyHash.smf2('Ali', sha1('ali' + 'Parola1')), 'Parola1')).toBe(true);
  });
});
