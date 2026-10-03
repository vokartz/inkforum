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
      style: 'modern' | 'community';
      radius: string;
      lang: string;
      favicon: string;
      safeMode: boolean;
      extraCsp: import('@forum/shared').CspSources | null;
      attrs: string;
    }
  }

  var __FORUM_API_INJECT__: ((opts: ForumInjectOptions) => Promise<ForumInjectResponse>) | undefined;
}

export {};
