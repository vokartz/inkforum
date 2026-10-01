import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

/**
 * SSRF'e karşı güvenli giden istek: hedefin çözümlenen IP adresi bağlantı anında denetlenir
 * (DNS yeniden bağlama saldırısına karşı da; denetlenen adrese bağlanılır). Yerel ağ, döngü,
 * bulut üst veri (169.254.169.254) ve özel adresler reddedilir.
 */

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => (n & (~0 << (32 - bits))) >>> 0 === v4ToInt(base));
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPrivateAddress(mapped[1]!);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6);
}

export class BlockedAddressError extends Error {
  constructor(host: string) {
    super(`Güvenlik nedeniyle yerel / özel ağ adreslerine istek gönderilemez (${host}).`);
    this.name = 'BlockedAddressError';
  }
}

export interface SafeResponse {
  status: number;
  /** En fazla `maxBytes` kadar gövde */
  text: string;
  /** Ham gövde (görsel indirmeleri için) */
  body: Buffer;
  contentType: string;
}

export async function safeFetch(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number; maxBytes?: number; allowPrivate?: boolean },
): Promise<SafeResponse> {
  const u = new URL(url);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Yalnızca http(s) adresleri desteklenir.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!opts.allowPrivate && isIP(host) && isPrivateAddress(host)) throw new BlockedAddressError(host);

  // Çözümlenen her adres denetlenir; bağlantı denetlenen adrese yapılır
  const lookup = (hostname: string, options: object, cb: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return cb(err, '', 4);
      const list = addresses as LookupAddress[];
      if (!opts.allowPrivate && list.some((a) => isPrivateAddress(a.address))) return cb(new BlockedAddressError(hostname), '', 4);
      if ((options as { all?: boolean }).all) cb(null, list);
      else cb(null, list[0]!.address, list[0]!.family);
    });
  };

  const request = u.protocol === 'https:' ? httpsRequest : httpRequest;
  const maxBytes = opts.maxBytes ?? 4096;
  return new Promise<SafeResponse>((resolve, reject) => {
    const req = request(
      u,
      { method: opts.method ?? 'GET', headers: opts.headers, lookup: lookup as never, timeout: opts.timeoutMs ?? 10_000 },
      (res: IncomingMessage) => {
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          if (size < maxBytes) chunks.push(c.subarray(0, maxBytes - size));
          size += c.length;
          if (size > maxBytes * 4) res.destroy();
        });
        const done = () => {
          const body = Buffer.concat(chunks);
          resolve({ status: res.statusCode ?? 0, text: body.toString('utf8'), body, contentType: String(res.headers['content-type'] ?? '') });
        };
        res.on('end', done);
        res.on('close', done);
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error(`Zaman aşımı (${Math.round((opts.timeoutMs ?? 10_000) / 1000)} sn)`), { name: 'TimeoutError' })));
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}
