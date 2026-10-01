import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp } from '../app.factory.js';
import { loadConfig, type AppConfig } from '../config/config.js';
import { SettingsService } from '../settings/settings.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { MailService } from '../mail/mail.service.js';
import { Clock } from '../common/clock.js';
import { Db } from '../database/db.service.js';

export const ORIGIN = 'http://forum.test';
export const ADMIN = { username: 'admin', email: 'admin@forum.test', password: 'AdminPass123' };

export interface Harness {
  app: NestExpressApplication;
  config: AppConfig;
  settings: SettingsService;
  jobs: JobsService;
  mail: MailService;
  clock: Clock;
  db: Db;
  agent(): Agent;
  close(): Promise<void>;
}

/** Cookie'leri saklayan ve her istekte Origin başlığı gönderen istemci. */
export class Agent {
  private cookies = new Map<string, string>();

  constructor(private readonly app: NestExpressApplication) {}

  private apply(req: request.Test): request.Test {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    req.set('Origin', ORIGIN);
    if (cookie) req.set('Cookie', cookie);
    return req;
  }

  private store(res: request.Response): request.Response {
    const set = res.headers['set-cookie'] as unknown as string[] | undefined;
    for (const c of set ?? []) {
      const [pair, ...attrs] = c.split(';');
      const [name, value] = pair!.split('=') as [string, string];
      const expired = attrs.some((a) => /expires=Thu, 01 Jan 1970/i.test(a)) || value === '';
      if (expired) this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value);
    }
    return res;
  }

  async get(path: string) {
    return this.store(await this.apply(request(this.app.getHttpServer()).get(path)));
  }

  async post(path: string, body: unknown = {}) {
    return this.store(await this.apply(request(this.app.getHttpServer()).post(path)).send(body as object));
  }

  async put(path: string, body: unknown = {}) {
    return this.store(await this.apply(request(this.app.getHttpServer()).put(path)).send(body as object));
  }

  async patch(path: string, body: unknown = {}) {
    return this.store(await this.apply(request(this.app.getHttpServer()).patch(path)).send(body as object));
  }

  async delete(path: string) {
    return this.store(await this.apply(request(this.app.getHttpServer()).delete(path)));
  }

  async upload(path: string, field: string, buffer: Buffer, filename: string) {
    return this.store(await this.apply(request(this.app.getHttpServer()).post(path)).attach(field, buffer, filename));
  }

  hasSession(): boolean {
    return [...this.cookies.keys()].some((k) => k.includes('forum_sid'));
  }

  clear(): void {
    this.cookies.clear();
  }
}

export async function createHarness(env: Record<string, string> = {}): Promise<Harness> {
  const config = loadConfig(
    { ...process.env },
    {
      NODE_ENV: 'test',
      APP_URL: ORIGIN,
      DB_DRIVER: process.env.TEST_DB_DRIVER ?? 'sqlite',
      DB_SQLITE_PATH: ':memory:',
      STORAGE_DIR: process.env.TEST_STORAGE_DIR ?? join(tmpdir(), 'forum-test-storage'),
      MAIL_DRIVER: 'log',
      WORKER_ENABLED: 'false',
      ADMIN_USERNAME: ADMIN.username,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      IMAGE_DRIVER: 'passthrough',
      ...env,
    },
  );
  const app = await createApp(config);
  await app.init();
  const settings = app.get(SettingsService);
  // Testlerde form zamanlama kontrolünü kapat.
  await settings.set('registration.minSubmitSeconds', 0);
  return {
    app,
    config,
    settings,
    jobs: app.get(JobsService),
    mail: app.get(MailService),
    clock: app.get(Clock),
    db: app.get(Db),
    agent: () => new Agent(app),
    close: () => app.close(),
  };
}

/** Kayıt formu için güncel politika versiyonları. */
export async function registrationPolicyIds(agent: Agent): Promise<number[]> {
  const res = await agent.get('/api/auth/register');
  return (res.body.policies as Array<{ versionId: number }>).map((p) => p.versionId);
}

export async function registerActive(h: Harness, username: string, password = 'Password123'): Promise<Agent> {
  const agent = h.agent();
  const mode = h.settings.get('registration.mode');
  if (mode !== 'open') await h.settings.set('registration.mode', 'open');
  const res = await agent.post('/api/auth/register', {
    username,
    email: `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@forum.test`,
    password,
    acceptedPolicyVersionIds: await registrationPolicyIds(agent),
  });
  if (mode !== 'open') await h.settings.set('registration.mode', mode);
  if (res.status !== 201) throw new Error(`Kayıt başarısız: ${JSON.stringify(res.body)}`);
  return agent;
}

export async function loginAgent(h: Harness, identifier: string, password: string): Promise<Agent> {
  const agent = h.agent();
  const res = await agent.post('/api/auth/login', { identifier, password });
  if (res.status !== 200) throw new Error(`Giriş başarısız: ${JSON.stringify(res.body)}`);
  return agent;
}

export async function adminAgent(h: Harness): Promise<Agent> {
  const agent = await loginAgent(h, ADMIN.username, ADMIN.password);
  const res = await agent.post('/api/auth/elevate', { password: ADMIN.password });
  if (res.status !== 200) throw new Error(`Yükseltme başarısız: ${JSON.stringify(res.body)}`);
  return agent;
}
