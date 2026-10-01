import { randomBytes } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { createServer, request, type RequestListener, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INTERNAL_IP_HEADER, INTERNAL_TOKEN_HEADER, setInternalToken } from './common/http.js';

export interface BridgeRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  payload?: Buffer;
  remoteAddress?: string;
}

export interface BridgeResponse {
  statusCode: number;
  headers: Record<string, string | string[] | number | undefined>;
  rawPayload: Buffer;
}

/**
 * SvelteKit SSR'ın API'yi aynı process içinde çağırması için köprü.
 * Aynı Express uygulaması ek olarak yerel bir sokette (Unix socket / Windows named pipe) dinler;
 * TCP portu gerekmez, bu yüzden Passenger gibi portu kendisi yöneten ortamlarda da çalışır.
 * İstemcinin gerçek IP'si, yalnızca bu process'in bildiği rastgele bir anahtarla birlikte iletilir.
 */
export async function startInternalBridge(listener: RequestListener): Promise<{
  inject: (opts: BridgeRequest) => Promise<BridgeResponse>;
  close: () => Promise<void>;
}> {
  const token = randomBytes(24).toString('hex');
  setInternalToken(token);

  const socketPath =
    process.platform === 'win32'
      ? `\\\\?\\pipe\\forum-api-${process.pid}-${randomBytes(4).toString('hex')}`
      : join(tmpdir(), `forum-api-${process.pid}.sock`);
  if (process.platform !== 'win32' && existsSync(socketPath)) unlinkSync(socketPath);

  const server: Server = createServer(listener);
  server.keepAliveTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => resolve());
  });

  const inject = (opts: BridgeRequest) =>
    new Promise<BridgeResponse>((resolve, reject) => {
      const headers: Record<string, string> = { ...opts.headers, [INTERNAL_TOKEN_HEADER]: token };
      if (opts.remoteAddress) headers[INTERNAL_IP_HEADER] = opts.remoteAddress;
      if (opts.payload) headers['content-length'] = String(opts.payload.length);
      const req = request({ socketPath, method: opts.method, path: opts.url, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 500, headers: res.headers, rawPayload: Buffer.concat(chunks) }));
        res.on('error', reject);
      });
      req.on('error', reject);
      if (opts.payload) req.write(opts.payload);
      req.end();
    });

  const close = () =>
    new Promise<void>((resolve) => {
      server.close(() => {
        if (process.platform !== 'win32' && existsSync(socketPath)) {
          try {
            unlinkSync(socketPath);
          } catch {
            /* zaten silinmiş */
          }
        }
        resolve();
      });
    });

  return { inject, close };
}
