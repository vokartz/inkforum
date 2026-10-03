export interface CustomEmojiItem {
  shortcode: string;
  name: string;
  category: string;
  url: string;
}

let promise: Promise<CustomEmojiItem[]> | null = null;
let byCode = new Map<string, CustomEmojiItem>();

export function loadCustomEmojis(): Promise<CustomEmojiItem[]> {
  promise ??= fetch('/api/emojis', { headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : []))
    .then((list: CustomEmojiItem[]) => {
      byCode = new Map(list.map((e) => [e.shortcode, e]));
      return list;
    })
    .catch(() => []);
  return promise;
}

export function customEmoji(code: string): CustomEmojiItem | undefined {
  return byCode.get(code.replace(/^:|:$/g, ''));
}
