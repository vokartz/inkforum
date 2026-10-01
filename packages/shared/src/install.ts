import { z } from 'zod';
import { REGISTRATION_MODES } from './settings.js';
import { PLUGIN_KEYS } from './plugins.js';
import { mailTransportInput } from './mail-templates.js';

/**
 * İlk kurulum sihirbazı (/install). Hiç yönetici yokken açılır; kurulum kodu sunucu konsoluna
 * (Docker'da `docker compose logs`) ve storage/INSTALL_CODE.txt dosyasına yazılır.
 */

export const INSTALL_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}$/i;

export const installCodeInput = z.object({
  code: z.string().trim().max(20),
});

export const INSTALL_THEMES = ['modern', 'community', 'classic'] as const;

export const installInput = z
  .object({
    code: z.string().trim().max(20),
    site: z.object({
      name: z.string().trim().min(2, 'Forum adı en az 2 karakter olmalı.').max(60),
      description: z.string().trim().max(300).default(''),
      theme: z.enum(INSTALL_THEMES).default('modern'),
      accent: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i, 'Geçersiz renk.')
        .default('#9c9c9c'),
      mode: z.enum(['dark', 'light']).default('dark'),
    }),
    admin: z.object({
      username: z
        .string()
        .trim()
        .min(3, 'Kullanıcı adı en az 3 karakter olmalı.')
        .max(24, 'Kullanıcı adı en fazla 24 karakter olabilir.')
        .regex(/^[\p{L}\p{N}_.-]+$/u, 'Kullanıcı adında yalnızca harf, rakam, nokta, alt çizgi ve tire kullanılabilir.'),
      email: z.email('Geçerli bir e-posta adresi girin.').max(200),
      password: z.string().min(10, 'Şifre en az 10 karakter olmalı.').max(200),
    }),
    community: z.object({
      registration: z.enum(REGISTRATION_MODES).default('email'),
      sampleContent: z.boolean().default(true),
      plugins: z.array(z.enum(PLUGIN_KEYS)).default(['wiki']),
    }),
    /** Boşsa e-posta ayarı sonraya bırakılır (e-postalar günlük dosyasına yazılır) */
    mail: mailTransportInput.nullable().default(null),
    mailFrom: z.email('Geçerli bir gönderen adresi girin.').max(200).nullable().default(null),
  })
  .strict();
export type InstallInput = z.output<typeof installInput>;

export type InstallCheckStatus = 'ok' | 'warn' | 'fail';

export interface InstallCheck {
  key: string;
  label: string;
  status: InstallCheckStatus;
  detail: string;
}

export interface InstallStatus {
  installed: boolean;
  version: string;
}

export interface InstallEnvironment {
  version: string;
  checks: InstallCheck[];
  appUrl: string;
  db: 'sqlite' | 'postgres' | 'pglite';
  deploy: DeployMode;
  mailDriver: string;
  suggestedName: string;
}

export type DeployMode = 'docker' | 'release' | 'source';

export const DEPLOY_MODE_INFO: Record<DeployMode, { label: string; description: string }> = {
  docker: { label: 'Docker', description: 'Güncellemeler yardımcı güncelleyici kapsayıcı ile tek tıkla kurulur.' },
  release: { label: 'Sunucu paketi', description: 'Sürüm paketi indirilir, doğrulanır ve yerine kurulur; ardından uygulama yeniden başlatılır.' },
  source: { label: 'Kaynak kod', description: 'Geliştirme kurulumu: güncellemeler kontrol edilir ama otomatik kurulmaz.' },
};
