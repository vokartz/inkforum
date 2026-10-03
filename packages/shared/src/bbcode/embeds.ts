export type EmbedKind = 'video' | 'audio' | 'post' | 'code' | 'map' | 'card';

export interface EmbedResult {
  provider: string;
  name: string;
  kind: EmbedKind;
  src: string | null;
  ratio?: string;
  height?: number;
  maxWidth?: number;
  allow?: string;
  card?: { title: string; subtitle: string; href: string; action: string };
  url: string;
}

export interface EmbedProviderInfo {
  key: string;
  name: string;
  kind: EmbedKind;
  examples: string[];
  color: string;
}

export interface CustomEmbedProvider {
  key: string;
  name: string;
  pattern: string;
  template: string;
  ratio?: string | null;
  height?: number | null;
  maxWidth?: number | null;
  enabled?: boolean;
}

export interface EmbedOptions {
  host?: string;
  disabled?: string[];
  custom?: CustomEmbedProvider[];
}

const MEDIA_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share';
const AUDIO_ALLOW = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';

const ID = /^[A-Za-z0-9_-]+$/;
const enc = encodeURIComponent;

function parseTime(v: string | null): number {
  if (!v) return 0;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

function host(u: URL): string {
  return u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
}

type Matcher = (u: URL, opts: EmbedOptions) => Omit<EmbedResult, 'provider' | 'name' | 'url'> | null;

interface BuiltinProvider extends EmbedProviderInfo {
  match: Matcher;
}

const BUILTIN: BuiltinProvider[] = [
  {
    key: 'youtube',
    name: 'YouTube',
    kind: 'video',
    color: '#ff0033',
    examples: ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=42', 'https://www.youtube.com/shorts/aqz-KE-bpKQ'],
    match: (u) => {
      const h = host(u);
      if (!['youtube.com', 'youtu.be', 'music.youtube.com', 'youtube-nocookie.com'].includes(h)) return null;
      const start = parseTime(u.searchParams.get('t') ?? u.searchParams.get('start'));
      const q = start ? `?start=${start}` : '';
      let id: string | null = null;
      let shorts = false;
      if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0] ?? null;
      else if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = /^\/(embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);
        if (m) {
          id = m[2]!;
          shorts = m[1] === 'shorts';
        }
      }
      const list = u.searchParams.get('list');
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
        return shorts
          ? { kind: 'video', src: `https://www.youtube-nocookie.com/embed/${id}`, ratio: '9/16', maxWidth: 340, allow: MEDIA_ALLOW }
          : { kind: 'video', src: `https://www.youtube-nocookie.com/embed/${id}${q}`, ratio: '16/9', maxWidth: 720, allow: MEDIA_ALLOW };
      }
      if (list && ID.test(list) && u.pathname === '/playlist') {
        return { kind: 'video', src: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`, ratio: '16/9', maxWidth: 720, allow: MEDIA_ALLOW };
      }
      return null;
    },
  },
  {
    key: 'vimeo',
    name: 'Vimeo',
    kind: 'video',
    color: '#1ab7ea',
    examples: ['https://vimeo.com/76979871'],
    match: (u) => {
      if (!['vimeo.com', 'player.vimeo.com'].includes(host(u))) return null;
      const m = /\/(?:video\/)?(\d{5,12})(?:\/([0-9a-f]{6,}))?/.exec(u.pathname);
      if (!m) return null;
      return { kind: 'video', src: `https://player.vimeo.com/video/${m[1]}${m[2] ? `?h=${m[2]}` : ''}`, ratio: '16/9', maxWidth: 720, allow: MEDIA_ALLOW };
    },
  },
  {
    key: 'dailymotion',
    name: 'Dailymotion',
    kind: 'video',
    color: '#0066dc',
    examples: ['https://www.dailymotion.com/video/x8abcd1'],
    match: (u) => {
      const h = host(u);
      const m = h === 'dai.ly' ? /^\/([a-z0-9]+)/i.exec(u.pathname) : h === 'dailymotion.com' ? /^\/video\/([a-z0-9]+)/i.exec(u.pathname) : null;
      return m ? { kind: 'video', src: `https://geo.dailymotion.com/player.html?video=${m[1]}`, ratio: '16/9', maxWidth: 720, allow: MEDIA_ALLOW } : null;
    },
  },
  {
    key: 'twitch',
    name: 'Twitch',
    kind: 'video',
    color: '#9146ff',
    examples: ['https://www.twitch.tv/kanaladi', 'https://clips.twitch.tv/KlipAdi', 'https://www.twitch.tv/videos/123456789'],
    match: (u, o) => {
      const h = host(u);
      if (!o.host || !['twitch.tv', 'clips.twitch.tv'].includes(h)) return null;
      const parent = `parent=${enc(o.host)}`;
      if (h === 'clips.twitch.tv') {
        const slug = u.pathname.slice(1).split('/')[0];
        return slug && ID.test(slug) ? { kind: 'video', src: `https://clips.twitch.tv/embed?clip=${slug}&${parent}&autoplay=false`, ratio: '16/9', maxWidth: 720, allow: MEDIA_ALLOW } : null;
      }
      let m = /^\/[^/]+\/clip\/([A-Za-z0-9_-]+)/.exec(u.pathname);
      if (m) return { kind: 'video', src: `https://clips.twitch.tv/embed?clip=${m[1]}&${parent}&autoplay=false`, ratio: '16/9', maxWidth: 720, allow: MEDIA_ALLOW };
      m = /^\/videos\/(\d+)/.exec(u.pathname);
      if (m) return { kind: 'video', src: `https://player.twitch.tv/?video=v${m[1]}&${parent}&autoplay=false`, ratio: '16/9', maxWidth: 720, allow: MEDIA_ALLOW };
      m = /^\/([A-Za-z0-9_]{3,25})\/?$/.exec(u.pathname);
      if (m && !['directory', 'videos', 'settings', 'p', 'search'].includes(m[1]!.toLowerCase())) {
        return { kind: 'video', src: `https://player.twitch.tv/?channel=${m[1]}&${parent}&autoplay=false`, ratio: '16/9', maxWidth: 720, allow: MEDIA_ALLOW };
      }
      return null;
    },
  },
  {
    key: 'kick',
    name: 'Kick',
    kind: 'video',
    color: '#53fc18',
    examples: ['https://kick.com/kanaladi'],
    match: (u) => {
      if (host(u) !== 'kick.com') return null;
      const m = /^\/([A-Za-z0-9_-]{3,30})\/?$/.exec(u.pathname);
      return m ? { kind: 'video', src: `https://player.kick.com/${m[1]}?autoplay=false`, ratio: '16/9', maxWidth: 720, allow: MEDIA_ALLOW } : null;
    },
  },
  {
    key: 'streamable',
    name: 'Streamable',
    kind: 'video',
    color: '#0f90fa',
    examples: ['https://streamable.com/abc123'],
    match: (u) => {
      if (host(u) !== 'streamable.com') return null;
      const m = /^\/(?:e\/)?([a-z0-9]+)\/?$/i.exec(u.pathname);
      return m ? { kind: 'video', src: `https://streamable.com/e/${m[1]}`, ratio: '16/9', maxWidth: 720, allow: MEDIA_ALLOW } : null;
    },
  },
  {
    key: 'tiktok',
    name: 'TikTok',
    kind: 'video',
    color: '#ff0050',
    examples: ['https://www.tiktok.com/@kullanici/video/7234567890123456789'],
    match: (u) => {
      if (host(u) !== 'tiktok.com') return null;
      const m = /\/video\/(\d{8,25})/.exec(u.pathname);
      return m ? { kind: 'video', src: `https://www.tiktok.com/embed/v2/${m[1]}`, height: 740, maxWidth: 340, allow: MEDIA_ALLOW } : null;
    },
  },
  {
    key: 'instagram',
    name: 'Instagram',
    kind: 'post',
    color: '#e1306c',
    examples: ['https://www.instagram.com/p/C1a2b3c4d5e/', 'https://www.instagram.com/reel/C1a2b3c4d5e/'],
    match: (u) => {
      if (host(u) !== 'instagram.com') return null;
      const m = /^\/(?:[^/]+\/)?(p|reel|tv)\/([A-Za-z0-9_-]+)/.exec(u.pathname);
      return m ? { kind: 'post', src: `https://www.instagram.com/${m[1] === 'tv' ? 'p' : m[1]}/${m[2]}/embed/captioned/`, height: 620, maxWidth: 480 } : null;
    },
  },
  {
    key: 'twitter',
    name: 'X (Twitter)',
    kind: 'post',
    color: '#1d9bf0',
    examples: ['https://x.com/kullanici/status/1234567890123456789'],
    match: (u) => {
      if (!['twitter.com', 'x.com'].includes(host(u))) return null;
      const m = /^\/[A-Za-z0-9_]{1,15}\/status(?:es)?\/(\d{5,25})/.exec(u.pathname);
      return m ? { kind: 'post', src: `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&dnt=true`, height: 420, maxWidth: 550 } : null;
    },
  },
  {
    key: 'facebook',
    name: 'Facebook',
    kind: 'post',
    color: '#1877f2',
    examples: ['https://www.facebook.com/sayfa/posts/pfbid0abc', 'https://www.facebook.com/watch/?v=1234567890'],
    match: (u) => {
      const h = host(u);
      if (h === 'fb.watch') return { kind: 'video', src: `https://www.facebook.com/plugins/video.php?href=${enc(u.href)}&show_text=false`, ratio: '16/9', maxWidth: 720, allow: MEDIA_ALLOW };
      if (h !== 'facebook.com') return null;
      if (/\/(videos|watch|reel)\b/.test(u.pathname)) {
        return { kind: 'video', src: `https://www.facebook.com/plugins/video.php?href=${enc(u.href)}&show_text=false`, ratio: '16/9', maxWidth: 720, allow: MEDIA_ALLOW };
      }
      if (/\/(posts|photos|permalink\.php|story\.php)/.test(u.pathname) || u.searchParams.has('story_fbid')) {
        return { kind: 'post', src: `https://www.facebook.com/plugins/post.php?href=${enc(u.href)}&show_text=true&width=500`, height: 560, maxWidth: 500 };
      }
      return null;
    },
  },
  {
    key: 'reddit',
    name: 'Reddit',
    kind: 'post',
    color: '#ff4500',
    examples: ['https://www.reddit.com/r/turkey/comments/abc123/baslik/'],
    match: (u) => {
      if (!['reddit.com', 'old.reddit.com', 'new.reddit.com'].includes(host(u))) return null;
      const m = /^\/r\/([A-Za-z0-9_]{2,25})\/comments\/([a-z0-9]{3,10})(?:\/([^/?#]*))?/.exec(u.pathname);
      return m ? { kind: 'post', src: `https://embed.reddit.com/r/${m[1]}/comments/${m[2]}/${m[3] ?? ''}?embed=true&showmedia=true`, height: 460, maxWidth: 640 } : null;
    },
  },
  {
    key: 'threads',
    name: 'Threads',
    kind: 'post',
    color: '#101010',
    examples: ['https://www.threads.net/@kullanici/post/C1a2b3c4d5e'],
    match: (u) => {
      if (!['threads.net', 'threads.com'].includes(host(u))) return null;
      const m = /^\/@([A-Za-z0-9._]{1,30})\/post\/([A-Za-z0-9_-]+)/.exec(u.pathname);
      return m ? { kind: 'post', src: `https://www.threads.net/@${m[1]}/post/${m[2]}/embed`, height: 520, maxWidth: 540 } : null;
    },
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    kind: 'post',
    color: '#0a66c2',
    examples: ['https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/'],
    match: (u) => {
      if (host(u) !== 'linkedin.com') return null;
      const m = /urn:li:(activity|share|ugcPost):(\d{10,25})/.exec(decodeURIComponent(u.pathname)) ?? /activity-(\d{10,25})/.exec(u.pathname);
      if (!m) return null;
      const urn = m.length === 3 ? `urn:li:${m[1]}:${m[2]}` : `urn:li:activity:${m[1]}`;
      return { kind: 'post', src: `https://www.linkedin.com/embed/feed/update/${urn}`, height: 560, maxWidth: 540 };
    },
  },
  {
    key: 'pinterest',
    name: 'Pinterest',
    kind: 'post',
    color: '#e60023',
    examples: ['https://www.pinterest.com/pin/123456789012345678/'],
    match: (u) => {
      if (!/^([a-z]{2}\.)?pinterest\.[a-z.]+$/.test(host(u))) return null;
      const m = /^\/pin\/(\d{5,25})/.exec(u.pathname);
      return m ? { kind: 'post', src: `https://assets.pinterest.com/ext/embed.html?id=${m[1]}`, height: 620, maxWidth: 345 } : null;
    },
  },
  {
    key: 'telegram',
    name: 'Telegram',
    kind: 'post',
    color: '#229ed9',
    examples: ['https://t.me/kanaladi/123'],
    match: (u) => {
      if (!['t.me', 'telegram.me'].includes(host(u))) return null;
      const m = /^\/(?:s\/)?([A-Za-z0-9_]{4,32})\/(\d{1,10})\/?$/.exec(u.pathname);
      return m ? { kind: 'post', src: `https://t.me/${m[1]}/${m[2]}?embed=1`, height: 420, maxWidth: 540 } : null;
    },
  },
  {
    key: 'spotify',
    name: 'Spotify',
    kind: 'audio',
    color: '#1db954',
    examples: ['https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'],
    match: (u) => {
      if (host(u) !== 'open.spotify.com') return null;
      const m = /^\/(?:intl-[a-z]{2}\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{10,40})/.exec(u.pathname);
      if (!m) return null;
      const compact = m[1] === 'track' || m[1] === 'episode';
      return { kind: 'audio', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: compact ? 152 : 352, maxWidth: 640, allow: AUDIO_ALLOW };
    },
  },
  {
    key: 'soundcloud',
    name: 'SoundCloud',
    kind: 'audio',
    color: '#ff5500',
    examples: ['https://soundcloud.com/sanatci/parca-adi'],
    match: (u) => {
      if (!['soundcloud.com', 'on.soundcloud.com'].includes(host(u))) return null;
      if (!/^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+/.test(u.pathname) && host(u) !== 'on.soundcloud.com') return null;
      const set = u.pathname.includes('/sets/');
      return {
        kind: 'audio',
        src: `https://w.soundcloud.com/player/?url=${enc(`https://soundcloud.com${u.pathname}`)}&color=%23ff5500&auto_play=false&visual=false&show_comments=false`,
        height: set ? 360 : 166,
        maxWidth: 720,
        allow: AUDIO_ALLOW,
      };
    },
  },
  {
    key: 'applemusic',
    name: 'Apple Music',
    kind: 'audio',
    color: '#fa243c',
    examples: ['https://music.apple.com/tr/album/album-adi/1234567890?i=1234567891'],
    match: (u) => {
      if (host(u) !== 'music.apple.com') return null;
      if (!/^\/[a-z]{2}\/(album|playlist|song|station)\//.test(u.pathname)) return null;
      const single = u.searchParams.has('i') || u.pathname.includes('/song/');
      return { kind: 'audio', src: `https://embed.music.apple.com${u.pathname}${u.search}`, height: single ? 175 : 450, maxWidth: 660, allow: AUDIO_ALLOW };
    },
  },
  {
    key: 'deezer',
    name: 'Deezer',
    kind: 'audio',
    color: '#a238ff',
    examples: ['https://www.deezer.com/tr/track/3135556'],
    match: (u) => {
      if (host(u) !== 'deezer.com') return null;
      const m = /^\/(?:[a-z]{2}\/)?(track|album|playlist|episode|artist)\/(\d+)/.exec(u.pathname);
      return m ? { kind: 'audio', src: `https://widget.deezer.com/widget/dark/${m[1]}/${m[2]}`, height: m[1] === 'track' ? 150 : 300, maxWidth: 700, allow: AUDIO_ALLOW } : null;
    },
  },
  {
    key: 'steam',
    name: 'Steam',
    kind: 'card',
    color: '#1b2838',
    examples: ['https://store.steampowered.com/app/271590/'],
    match: (u) => {
      if (host(u) !== 'store.steampowered.com') return null;
      const m = /^\/app\/(\d+)/.exec(u.pathname);
      return m ? { kind: 'card', src: `https://store.steampowered.com/widget/${m[1]}/`, height: 190, maxWidth: 646 } : null;
    },
  },
  {
    key: 'discord',
    name: 'Discord',
    kind: 'card',
    color: '#5865f2',
    examples: ['https://discord.gg/davetkodu'],
    match: (u) => {
      const h = host(u);
      let code: string | null = null;
      if (h === 'discord.gg') code = u.pathname.slice(1).split('/')[0] ?? null;
      else if (['discord.com', 'discordapp.com'].includes(h)) code = /^\/invite\/([A-Za-z0-9-]+)/.exec(u.pathname)?.[1] ?? null;
      if (!code || !/^[A-Za-z0-9-]{2,40}$/.test(code)) return null;
      return {
        kind: 'card',
        src: null,
        maxWidth: 440,
        card: { title: 'Discord sunucusuna davet', subtitle: `discord.gg/${code}`, href: `https://discord.gg/${code}`, action: 'Sunucuya katıl' },
      };
    },
  },
  {
    key: 'codepen',
    name: 'CodePen',
    kind: 'code',
    color: '#47cf73',
    examples: ['https://codepen.io/kullanici/pen/abcdEF'],
    match: (u) => {
      if (host(u) !== 'codepen.io') return null;
      const m = /^\/([A-Za-z0-9_-]+)\/(?:pen|full|details)\/([A-Za-z0-9]+)/.exec(u.pathname);
      return m ? { kind: 'code', src: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`, height: 420, maxWidth: 900 } : null;
    },
  },
  {
    key: 'giphy',
    name: 'GIPHY',
    kind: 'video',
    color: '#00ff99',
    examples: ['https://giphy.com/gifs/komik-kedi-3o7abKhOpu0NwenH3O'],
    match: (u) => {
      const h = host(u);
      let id: string | null = null;
      if (h === 'giphy.com') id = /^\/(?:gifs|embed)\/(?:[^/]*-)?([A-Za-z0-9]{8,})/.exec(u.pathname)?.[1] ?? null;
      else if (/^media\d?\.giphy\.com$/.test(h)) id = /\/media\/([A-Za-z0-9]{8,})\//.exec(u.pathname)?.[1] ?? null;
      return id ? { kind: 'video', src: `https://giphy.com/embed/${id}`, ratio: '4/3', maxWidth: 480 } : null;
    },
  },
  {
    key: 'imgur',
    name: 'Imgur',
    kind: 'post',
    color: '#1bb76e',
    examples: ['https://imgur.com/a/abc1234'],
    match: (u) => {
      if (host(u) !== 'imgur.com') return null;
      const m = /^\/(?:a|gallery)\/([A-Za-z0-9]{5,10})/.exec(u.pathname);
      return m ? { kind: 'post', src: `https://imgur.com/a/${m[1]}/embed?pub=true`, height: 520, maxWidth: 540 } : null;
    },
  },
  {
    key: 'googlemaps',
    name: 'Google Haritalar',
    kind: 'map',
    color: '#34a853',
    examples: ['https://www.google.com/maps/@41.0082,28.9784,14z'],
    match: (u) => {
      const h = host(u);
      if (!(h === 'google.com' || /^google\.[a-z.]+$/.test(h) || h === 'maps.google.com') || !u.pathname.startsWith('/maps')) return null;
      const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z/.exec(u.pathname);
      const q = at ? `${at[1]},${at[2]}` : (u.searchParams.get('q') ?? /\/maps\/place\/([^/@]+)/.exec(u.pathname)?.[1] ?? null);
      if (!q) return null;
      const z = at ? Math.round(Number(at[3])) : 14;
      return { kind: 'map', src: `https://maps.google.com/maps?q=${enc(decodeURIComponent(q).replace(/\+/g, ' '))}&z=${z}&output=embed`, ratio: '16/9', maxWidth: 720 };
    },
  },
];

export const EMBED_PROVIDERS: EmbedProviderInfo[] = BUILTIN.map(({ key, name, kind, examples, color }) => ({ key, name, kind, examples, color }));

function applyTemplate(template: string, m: RegExpExecArray, url: string): string | null {
  const out = template.replace(/\$(\d)/g, (_, d: string) => enc(m[Number(d)] ?? '')).replace(/\{url\}/g, enc(url));
  return /^https:\/\/[^\s"'<>`]+$/.test(out) ? out : null;
}

export function customProviderIssue(p: CustomEmbedProvider): string | null {
  try {
    new RegExp(p.pattern, 'i');
  } catch {
    return 'Düzenli ifade geçersiz.';
  }
  if (p.pattern.length > 300) return 'Düzenli ifade çok uzun.';
  if (!/^https:\/\//.test(p.template)) return 'Şablon https:// ile başlamalı.';
  if (/[\s"'<>`]/.test(p.template)) return 'Şablonda boşluk veya tırnak olamaz.';
  if (!p.ratio && !p.height) return 'Oran ya da yükseklik belirtin.';
  return null;
}

export function resolveEmbed(input: string, opts: EmbedOptions = {}): EmbedResult | null {
  const raw = (input ?? '').trim();
  if (!raw || raw.length > 2000 || /\s/.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;

  for (const c of opts.custom ?? []) {
    if (c.enabled === false || customProviderIssue(c)) continue;
    const m = new RegExp(c.pattern, 'i').exec(u.href);
    if (!m) continue;
    const src = applyTemplate(c.template, m, u.href);
    if (!src) continue;
    return {
      provider: `custom:${c.key}`,
      name: c.name,
      kind: 'post',
      src,
      ratio: c.ratio ?? undefined,
      height: c.ratio ? undefined : (c.height ?? 400),
      maxWidth: c.maxWidth ?? 720,
      allow: MEDIA_ALLOW,
      url: u.href,
    };
  }

  const disabled = new Set(opts.disabled ?? []);
  for (const p of BUILTIN) {
    if (disabled.has(p.key)) continue;
    const r = p.match(u, opts);
    if (r) return { ...r, provider: p.key, name: p.name, url: u.href };
  }
  return null;
}
