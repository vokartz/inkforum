import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { EmojiRenderOptions } from '@forum/shared';

const require = createRequire(import.meta.url);

/** Twemoji SVG dizini (@twemoji/svg; görseller CC-BY 4.0, Twitter/jdecked). */
export const EMOJI_DIR = dirname(require.resolve('@twemoji/svg/1f600.svg'));

let codes: Set<string> | null = null;

/** Görseli bulunan emoji kodları (açılışta bir kez okunur). */
function available(): Set<string> {
  codes ??= new Set(
    readdirSync(EMOJI_DIR)
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.slice(0, -4)),
  );
  return codes;
}

/** Mesaj işleyicisine verilen emoji ayarı. */
export const emojiOptions: EmojiRenderOptions = { has: (code) => available().has(code), base: '/emoji/' };
