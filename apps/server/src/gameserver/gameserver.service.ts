import { Injectable } from '@nestjs/common';
import { createSocket } from 'node:dgram';
import { lookup, resolveSrv } from 'node:dns/promises';
import { Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import type { GameServerInput, GameServerStatus, GameServerType } from '@forum/shared';
import { Clock } from '../common/clock.js';
import { SettingsService } from '../settings/settings.service.js';
import { AuditService } from '../audit/audit.service.js';

type Stored = GameServerInput & { id: string };
interface Probe {
  online: boolean;
  players: number | null;
  maxPlayers: number | null;
  hostname: string | null;
}

const TTL = 60_000;
const TIMEOUT = 4000;
const DEFAULT_PORT: Record<GameServerType, number> = { fivem: 30120, minecraft: 25565, samp: 7777 };
const OFFLINE: Probe = { online: false, players: null, maxPlayers: null, hostname: null };

/** Renk / biçim kodlarını temizler (FiveM ^1, Minecraft §a) */
const clean = (s: string) => s.replace(/\^\d/g, '').replace(/§./g, '').trim().slice(0, 120) || null;

/**
 * Oyun sunucusu durumu: FiveM (HTTP), Minecraft Java (durum protokolü, TCP) ve SA-MP / open.mp (sorgu, UDP).
 * Sonuçlar dakikada bir tazelenir; aynı anda gelen istekler tek sorguyu paylaşır.
 */
@Injectable()
export class GameServerService {
  private readonly cache = new Map<string, { at: number; value: Probe }>();
  private readonly inflight = new Map<string, Promise<Probe>>();

  constructor(
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  servers(): Stored[] {
    return this.settings.get('gameserver.servers') as Stored[];
  }

  async save(input: GameServerInput[], actorId: number): Promise<void> {
    const used = new Set<string>();
    const servers = input.map((s) => {
      let id = s.id && !used.has(s.id) ? s.id : randomBytes(4).toString('hex');
      while (used.has(id)) id = randomBytes(4).toString('hex');
      used.add(id);
      return {
        id,
        name: s.name,
        type: s.type,
        host: s.host.toLowerCase(),
        port: s.port,
        joinCode: s.joinCode,
      };
    });
    await this.settings.update({ 'gameserver.servers': servers }, actorId, { allowHidden: true });
    this.cache.clear();
    await this.audit.log({
      type: 'admin',
      action: 'gameserver.settings',
      actorId,
      data: { count: servers.length },
    });
  }

  async statuses(): Promise<GameServerStatus[]> {
    return Promise.all(this.servers().map((s) => this.status(s)));
  }

  private address(s: Stored): string {
    const port = s.port ?? DEFAULT_PORT[s.type];
    return port === DEFAULT_PORT[s.type] && s.type !== 'samp' ? s.host : `${s.host}:${port}`;
  }

  private connectUrl(s: Stored): string | null {
    if (s.type === 'fivem')
      return s.joinCode
        ? `https://cfx.re/join/${s.joinCode}`
        : `fivem://connect/${s.host}:${s.port ?? DEFAULT_PORT.fivem}`;
    if (s.type === 'samp') return `samp://${s.host}:${s.port ?? DEFAULT_PORT.samp}`;
    return null;
  }

  async status(s: Stored): Promise<GameServerStatus> {
    const key = `${s.type}:${s.host}:${s.port ?? ''}:${s.joinCode}`;
    const hit = this.cache.get(key);
    let probe: Probe;
    if (hit && this.clock.now() - hit.at < TTL) probe = hit.value;
    else {
      let p = this.inflight.get(key);
      if (!p) {
        p = this.probe(s)
          .catch(() => OFFLINE)
          .finally(() => this.inflight.delete(key));
        this.inflight.set(key, p);
      }
      probe = await p;
      this.cache.set(key, { at: this.clock.now(), value: probe });
    }
    return {
      id: s.id,
      name: s.name,
      type: s.type,
      address: this.address(s),
      connectUrl: this.connectUrl(s),
      checkedAt: this.cache.get(key)?.at ?? this.clock.now(),
      ...probe,
    };
  }

  private probe(s: Stored): Promise<Probe> {
    if (s.type === 'fivem') return this.fivem(s);
    if (s.type === 'minecraft') return this.minecraft(s);
    return this.samp(s);
  }

  // ---------- FiveM ----------

  private async fivem(s: Stored): Promise<Probe> {
    if (s.joinCode) {
      const res = await fetch(
        `https://servers-frontend.fivem.net/api/servers/single/${encodeURIComponent(s.joinCode)}`,
        { signal: AbortSignal.timeout(TIMEOUT), headers: { 'user-agent': 'InkForum' } },
      );
      if (res.ok) {
        const d = (
          (await res.json()) as {
            Data?: { clients?: number; sv_maxclients?: number; svMaxclients?: number; hostname?: string };
          }
        ).Data;
        if (d)
          return {
            online: true,
            players: Number(d.clients ?? 0),
            maxPlayers: Number(d.sv_maxclients ?? d.svMaxclients ?? 0) || null,
            hostname: clean(String(d.hostname ?? '')),
          };
      }
    }
    const res = await fetch(`http://${s.host}:${s.port ?? DEFAULT_PORT.fivem}/dynamic.json`, {
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return OFFLINE;
    const d = (await res.json()) as { clients?: number; sv_maxclients?: number | string; hostname?: string };
    return {
      online: true,
      players: Number(d.clients ?? 0),
      maxPlayers: Number(d.sv_maxclients ?? 0) || null,
      hostname: clean(String(d.hostname ?? '')),
    };
  }

  // ---------- Minecraft Java (Server List Ping) ----------

  private async minecraft(s: Stored): Promise<Probe> {
    let host = s.host;
    let port = s.port ?? DEFAULT_PORT.minecraft;
    if (!s.port) {
      try {
        const [srv] = await resolveSrv(`_minecraft._tcp.${s.host}`);
        if (srv) {
          host = srv.name;
          port = srv.port;
        }
      } catch {
        /* SRV kaydı yok */
      }
    }
    const json = await new Promise<string>((resolve, reject) => {
      const sock = new Socket();
      let buf = Buffer.alloc(0);
      const done = (err?: Error, value?: string) => {
        sock.destroy();
        if (err) reject(err);
        else resolve(value!);
      };
      sock.setTimeout(TIMEOUT, () => done(new Error('timeout')));
      sock.once('error', (e) => done(e));
      sock.connect(port, host, () => {
        const hostBuf = Buffer.from(s.host, 'utf8');
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(port);
        const handshake = Buffer.concat([
          varint(0x00),
          varint(767),
          varint(hostBuf.length),
          hostBuf,
          portBuf,
          varint(1),
        ]);
        sock.write(Buffer.concat([varint(handshake.length), handshake, varint(1), varint(0x00)]));
      });
      sock.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        try {
          const [length, a] = readVarint(buf, 0);
          if (buf.length < a + length) return;
          const [, b] = readVarint(buf, a); // paket kimliği
          const [strLen, c] = readVarint(buf, b);
          done(undefined, buf.subarray(c, c + strLen).toString('utf8'));
        } catch {
          /* paket henüz tamamlanmadı */
        }
      });
    });
    const d = JSON.parse(json) as { players?: { online?: number; max?: number }; description?: unknown };
    return {
      online: true,
      players: Number(d.players?.online ?? 0),
      maxPlayers: Number(d.players?.max ?? 0) || null,
      hostname: clean(motd(d.description)),
    };
  }

  // ---------- SA-MP / open.mp (UDP sorgu) ----------

  private async samp(s: Stored): Promise<Probe> {
    const port = s.port ?? DEFAULT_PORT.samp;
    const { address } = await lookup(s.host, { family: 4 });
    const ip = address.split('.').map(Number);
    const packet = Buffer.alloc(11);
    packet.write('SAMP', 0, 'ascii');
    ip.forEach((b, i) => packet.writeUInt8(b, 4 + i));
    packet.writeUInt16LE(port, 8);
    packet.write('i', 10, 'ascii');
    const msg = await new Promise<Buffer>((resolve, reject) => {
      const sock = createSocket('udp4');
      const timer = setTimeout(() => (sock.close(), reject(new Error('timeout'))), TIMEOUT);
      sock.once('message', (m) => (clearTimeout(timer), sock.close(), resolve(m)));
      sock.once('error', (e) => (clearTimeout(timer), sock.close(), reject(e)));
      sock.send(packet, port, address);
    });
    let o = 11;
    o += 1; // şifreli mi
    const players = msg.readUInt16LE(o);
    const maxPlayers = msg.readUInt16LE(o + 2);
    o += 4;
    const hostLen = msg.readUInt32LE(o);
    const hostname = msg.subarray(o + 4, o + 4 + hostLen).toString('latin1');
    return { online: true, players, maxPlayers, hostname: clean(hostname) };
  }
}

function varint(n: number): Buffer {
  const out: number[] = [];
  let v = n >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return Buffer.from(out);
}

function readVarint(buf: Buffer, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let i = offset;
  for (;;) {
    if (i >= buf.length) throw new Error('eksik');
    const b = buf[i++]!;
    result |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return [result, i];
    shift += 7;
    if (shift > 35) throw new Error('bozuk varint');
  }
}

/** Minecraft MOTD: düz metin ya da sohbet bileşeni */
function motd(d: unknown): string {
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object') {
    const o = d as { text?: string; extra?: unknown[] };
    return `${o.text ?? ''}${(o.extra ?? []).map(motd).join('')}`;
  }
  return '';
}
