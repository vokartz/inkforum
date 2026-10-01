// See https://svelte.dev/docs/kit/types#app.d.ts

interface ForumInjectOptions {
  method: string;
  url: string;
  headers: Record<string, string>;
  payload?: Buffer;
  remoteAddress?: string;
}

interface ForumInjectResponse {
  statusCode: number;
  headers: Record<string, string | string[] | number | undefined>;
  rawPayload: Buffer;
}

declare global {
  namespace App {
    interface Error {
      message: string;
      code?: string;
      details?: Record<string, unknown>;
    }
    interface Locals {
      theme: 'system' | 'light' | 'dark';
      /** Yönetimin seçtiği tema (html data-style) */
      style: 'modern' | 'classic' | 'community';
      /** Köşe yuvarlaklığı (html data-radius) */
      radius: string;
      lang: string;
      /** Site simgesi (Yönetim → Görünüm → Görseller); yoksa varsayılan */
      favicon: string;
      /** Güvenli mod: özel kod parçacıkları yüklenmez (?safemode=1) */
      safeMode: boolean;
      /** Yönetimden izin verilen ek CSP kaynakları (özel kod için) */
      customCsp: { script: string[]; connect: string[]; style: string[]; font: string[] } | null;
    }
  }

  // Üretimde NestJS sunucusu tarafından tanımlanır (SSR'ın API'yi ağ kullanmadan çağırması için).
  var __FORUM_API_INJECT__: ((opts: ForumInjectOptions) => Promise<ForumInjectResponse>) | undefined;
}

export {};
