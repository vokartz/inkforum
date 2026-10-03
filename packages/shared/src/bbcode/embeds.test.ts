import { describe, expect, it } from 'vitest';
import { customProviderIssue, renderBBCode, resolveEmbed } from './index.js';

const opts = { host: 'forum.test' };

describe('resolveEmbed', () => {
  const cases: Array<[string, string, string]> = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s', 'youtube', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=65'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/aqz-KE-bpKQ', 'youtube', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ'],
    ['https://vimeo.com/76979871', 'vimeo', 'https://player.vimeo.com/video/76979871'],
    ['https://open.spotify.com/intl-tr/track/4cOdK2wGLETKBW3PvgPWqT?si=x', 'spotify', 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT'],
    ['https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', 'spotify', 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M'],
    ['https://www.twitch.tv/kanaladi', 'twitch', 'https://player.twitch.tv/?channel=kanaladi&parent=forum.test&autoplay=false'],
    ['https://clips.twitch.tv/KomikKlip-abc', 'twitch', 'https://clips.twitch.tv/embed?clip=KomikKlip-abc&parent=forum.test&autoplay=false'],
    ['https://x.com/kullanici/status/1234567890123456789', 'twitter', 'https://platform.twitter.com/embed/Tweet.html?id=1234567890123456789&dnt=true'],
    ['https://www.instagram.com/reel/C1a2b3c4d5e/', 'instagram', 'https://www.instagram.com/reel/C1a2b3c4d5e/embed/captioned/'],
    ['https://www.tiktok.com/@kisi/video/7234567890123456789', 'tiktok', 'https://www.tiktok.com/embed/v2/7234567890123456789'],
    ['https://www.reddit.com/r/turkey/comments/abc123/baslik/', 'reddit', 'https://embed.reddit.com/r/turkey/comments/abc123/baslik?embed=true&showmedia=true'],
    ['https://soundcloud.com/sanatci/parca', 'soundcloud', 'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fsanatci%2Fparca'],
    ['https://t.me/kanaladi/123', 'telegram', 'https://t.me/kanaladi/123?embed=1'],
    ['https://kick.com/kanaladi', 'kick', 'https://player.kick.com/kanaladi?autoplay=false'],
    ['https://store.steampowered.com/app/271590/GTA_V/', 'steam', 'https://store.steampowered.com/widget/271590/'],
  ];

  it.each(cases)('%s → %s', (url, provider, src) => {
    const r = resolveEmbed(url, opts);
    expect(r?.provider).toBe(provider);
    expect(r?.src?.startsWith(src)).toBe(true);
  });

  it('turns discord invites into cards', () => {
    const r = resolveEmbed('https://discord.gg/abcDEF', opts);
    expect(r).toMatchObject({ provider: 'discord', src: null, card: { href: 'https://discord.gg/abcDEF' } });
  });

  it('ignores unknown or malformed urls', () => {
    expect(resolveEmbed('https://evil.com/watch?v=dQw4w9WgXcQ', opts)).toBeNull();
    expect(resolveEmbed('javascript:alert(1)', opts)).toBeNull();
    expect(resolveEmbed('https://www.youtube.com/watch?v=<script>', opts)).toBeNull();
    expect(resolveEmbed('https://www.twitch.tv/kanaladi')).toBeNull();
  });

  it('respects disabled providers', () => {
    expect(resolveEmbed('https://youtu.be/dQw4w9WgXcQ', { disabled: ['youtube'] })).toBeNull();
  });

  it('supports custom providers with encoded captures', () => {
    const custom = [{ key: 'ornek', name: 'Örnek', pattern: '^https://video\\.ornek\\.com/v/(\\w+)', template: 'https://video.ornek.com/embed/$1', ratio: '16/9' }];
    const r = resolveEmbed('https://video.ornek.com/v/abc123', { custom });
    expect(r).toMatchObject({ provider: 'custom:ornek', src: 'https://video.ornek.com/embed/abc123', ratio: '16/9' });
    expect(customProviderIssue({ ...custom[0]!, template: 'javascript:alert(1)' })).toBeTruthy();
    expect(customProviderIssue({ ...custom[0]!, pattern: '(' })).toBeTruthy();
  });
});

describe('embed rendering', () => {
  it('renders [media] with sandboxed iframe', () => {
    const { html, embedCount } = renderBBCode('[media]https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT[/media]');
    expect(embedCount).toBe(1);
    expect(html).toContain('<iframe src="https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT"');
    expect(html).toContain('sandbox="');
    expect(html).toContain('height:152px');
  });

  it('auto-embeds standalone links but not inline ones', () => {
    const src = 'Şuna bakın:\nhttps://youtu.be/dQw4w9WgXcQ\nve şu metin içinde https://youtu.be/dQw4w9WgXcQ kalır.';
    const { html, embedCount } = renderBBCode(src, { autoEmbed: true });
    expect(embedCount).toBe(1);
    expect(html).toMatch(/^Şuna bakın:<div class="bb-embed bb-embed-ratio"/);
    expect(html).toContain('ve şu metin içinde <a href="https://youtu.be/dQw4w9WgXcQ"');
  });

  it('does not embed inside quotes and can defer loading', () => {
    expect(renderBBCode('[quote]\nhttps://youtu.be/dQw4w9WgXcQ\n[/quote]', { autoEmbed: true }).embedCount).toBe(0);
    const deferred = renderBBCode('[media]https://youtu.be/dQw4w9WgXcQ[/media]', { clickToLoad: true }).html;
    expect(deferred).toContain('bb-embed-deferred');
    expect(deferred).not.toContain('<iframe');
  });

  it('falls back to links when media is disabled', () => {
    expect(renderBBCode('[media]https://youtu.be/dQw4w9WgXcQ[/media]', { media: false }).html).toContain('<a href="https://youtu.be/dQw4w9WgXcQ"');
  });

  it('accepts bare youtube ids in [youtube]', () => {
    expect(renderBBCode('[youtube]dQw4w9WgXcQ[/youtube]').html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });
});
