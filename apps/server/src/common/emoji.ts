import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { EmojiRenderOptions } from '@forum/shared';

const require = createRequire(import.meta.url);

export const EMOJI_DIR = dirname(require.resolve('@twemoji/svg/1f600.svg'));

let codes: Set<string> | null = null;

function available(): Set<string> {
  codes ??= new Set(
    readdirSync(EMOJI_DIR)
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.slice(0, -4)),
  );
  return codes;
}

export const emojiOptions: EmojiRenderOptions = { has: (code) => available().has(code), base: '/emoji/' };
