import type { ResolvedBlock } from '@forum/shared';

/**
 * Stüdyo ⇄ önizleme çerçevesi (iframe) mesajları. Aynı kökenden gelmeyen mesajlar yok sayılır.
 */
export type ToFrame =
  | { type: 'blocks'; blocks: ResolvedBlock[]; selectedId: string | null; css: string; standalone: boolean }
  | { type: 'html'; html: string }
  | { type: 'prose'; html: string; title: string | null }
  | { type: 'scroll'; id: string };

export type FromFrame =
  | { type: 'ready' }
  | { type: 'select'; id: string }
  | { type: 'action'; action: 'up' | 'down' | 'duplicate' | 'remove' | 'insert'; id: string };

export const STUDIO_MSG = 'forum-studio';
