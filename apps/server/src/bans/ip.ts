import { isIPv4, isIPv6 } from 'node:net';

export function ipToHex(ip: string): string | null {
  let s = ip.trim();
  if (s.startsWith('::ffff:') && isIPv4(s.slice(7))) s = s.slice(7);
  if (isIPv4(s)) {
    const parts = s.split('.').map(Number);
    return '00000000000000000000ffff' + parts.map((p) => p.toString(16).padStart(2, '0')).join('');
  }
  if (!isIPv6(s)) return null;
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  let tail: string[] = [];
  const lastColon = s.lastIndexOf(':');
  const maybeV4 = s.slice(lastColon + 1);
  if (isIPv4(maybeV4)) {
    const p = maybeV4.split('.').map(Number);
    tail = [((p[0]! << 8) | p[1]!).toString(16), ((p[2]! << 8) | p[3]!).toString(16)];
    s = s.slice(0, lastColon + 1) + '0:0';
  }
  const [head, rest] = s.split('::') as [string, string | undefined];
  const headParts = head ? head.split(':') : [];
  const restParts = rest !== undefined && rest !== '' ? rest.split(':') : [];
  const missing = 8 - headParts.length - restParts.length;
  const groups = rest !== undefined ? [...headParts, ...Array(missing).fill('0'), ...restParts] : headParts;
  if (tail.length) groups.splice(6, 2, ...tail);
  if (groups.length !== 8) return null;
  return groups.map((g) => g.padStart(4, '0').toLowerCase()).join('');
}

function hexToBigInt(hex: string): bigint {
  return BigInt(`0x${hex}`);
}

function bigIntToHex(n: bigint): string {
  return n.toString(16).padStart(32, '0');
}

export interface IpRange {
  low: string;
  high: string;
}

export function parseIpPattern(input: string): IpRange | null {
  const v = input.trim();
  if (v.includes('*')) {
    const parts = v.split('.');
    if (parts.length !== 4) return null;
    const low = parts.map((p) => (p === '*' ? '0' : p)).join('.');
    const high = parts.map((p) => (p === '*' ? '255' : p)).join('.');
    const l = ipToHex(low);
    const h = ipToHex(high);
    return l && h ? { low: l, high: h } : null;
  }
  if (v.includes('-')) {
    const [a, b] = v.split('-').map((s) => s.trim());
    const l = a ? ipToHex(a) : null;
    const h = b ? ipToHex(b) : null;
    if (!l || !h) return null;
    return l <= h ? { low: l, high: h } : { low: h, high: l };
  }
  if (v.includes('/')) {
    const [addr, bitsStr] = v.split('/');
    const hex = addr ? ipToHex(addr) : null;
    if (!hex) return null;
    let bits = Number(bitsStr);
    if (!Number.isInteger(bits)) return null;
    if (addr && isIPv4(addr.trim())) bits += 96;
    if (bits < 0 || bits > 128) return null;
    const base = hexToBigInt(hex);
    const hostBits = BigInt(128 - bits);
    const mask = ((1n << 128n) - 1n) ^ ((1n << hostBits) - 1n);
    const low = base & mask;
    const high = low | ((1n << hostBits) - 1n);
    return { low: bigIntToHex(low), high: bigIntToHex(high) };
  }
  const hex = ipToHex(v);
  return hex ? { low: hex, high: hex } : null;
}
