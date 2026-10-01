/**
 * Gömülü içerik için tarayıcı tarafı yardımcılar (sayfa başına bir kez kurulur):
 *  - "Tıklayınca yükle" modundaki içerikleri tıklanınca iframe'e çevirir.
 *  - X/Instagram/Telegram/Reddit gibi gönderi gömmelerinin bildirdiği yüksekliğe göre iframe'i boyutlandırır.
 */
import { t } from '$lib/i18n.svelte';

const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms';

function loadDeferred(wrapper: HTMLElement) {
  const src = wrapper.dataset.embedSrc;
  if (!src || !/^https:\/\//.test(src)) return;
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = wrapper.dataset.embedTitle ?? t('Gömülü içerik');
  iframe.loading = 'lazy';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.setAttribute('sandbox', SANDBOX);
  if (wrapper.dataset.embedAllow) iframe.setAttribute('allow', wrapper.dataset.embedAllow);
  if (wrapper.dataset.embedHeight) iframe.style.height = `${Number(wrapper.dataset.embedHeight)}px`;
  wrapper.querySelector('.bb-embed-load')?.replaceWith(iframe);
  wrapper.classList.remove('bb-embed-deferred');
}

/** İleti içeriğinden bildirilen yüksekliği çıkarır (sağlayıcıya göre biçim değişir). */
function reportedHeight(origin: string, raw: unknown): number | null {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, any>;
  if (origin.endsWith('twitter.com') || origin.endsWith('x.com')) {
    const e = d['twttr.embed'];
    if (e?.method === 'twttr.private.resize') return Number(e.params?.[0]?.height) || null;
  }
  if (origin.endsWith('instagram.com') && d.type === 'MEASURE') return Number(d.details?.height) || null;
  if (origin.endsWith('t.me') && d.event === 'resize') return Number(d.height) || null;
  if (origin.endsWith('reddit.com') && (d.type === 'resize.embed' || d.type === 'resize')) return Number(d.data ?? d.height) || null;
  if (origin.endsWith('tiktok.com') && d.height) return Number(d.height) || null;
  return null;
}

export function installEmbedRuntime(): () => void {
  const onClick = (e: MouseEvent) => {
    const btn = (e.target as HTMLElement | null)?.closest?.('.bb-embed-load');
    const wrapper = btn?.closest<HTMLElement>('.bb-embed-deferred');
    if (!wrapper) return;
    e.preventDefault();
    loadDeferred(wrapper);
  };

  const onMessage = (e: MessageEvent) => {
    if (!/^https:\/\//.test(e.origin)) return;
    const height = reportedHeight(new URL(e.origin).hostname, e.data);
    if (!height) return;
    for (const iframe of document.querySelectorAll<HTMLIFrameElement>('.bb-embed iframe')) {
      if (iframe.contentWindow === e.source) {
        iframe.style.height = `${Math.min(Math.max(Math.round(height), 80), 2400)}px`;
        break;
      }
    }
  };

  document.addEventListener('click', onClick);
  window.addEventListener('message', onMessage);
  return () => {
    document.removeEventListener('click', onClick);
    window.removeEventListener('message', onMessage);
  };
}
