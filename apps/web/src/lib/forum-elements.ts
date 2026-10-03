import type { ForumIndex, RecentTopicItem, UserSummary } from '@forum/shared';
import { t } from '$lib/i18n.svelte';
import { formatCompact, timeAgo } from '$lib/format';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const cache = new Map<string, Promise<unknown>>();
function get<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } }).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)))));
    cache.set(url, p);
    setTimeout(() => cache.delete(url), 30_000);
  }
  return p;
}

function avatar(u: Pick<UserSummary, 'displayName' | 'avatarUrl'> | null, size: number): string {
  const name = u?.displayName ?? '?';
  return u?.avatarUrl
    ? `<img class="f-avatar" style="--size:${size}px" src="${esc(u.avatarUrl)}" alt="${esc(name)}" loading="lazy">`
    : `<span class="f-avatar" style="--size:${size}px;display:inline-grid;place-items:center;font-weight:700;font-size:${Math.round(size * 0.42)}px;color:var(--muted-foreground)">${esc(name.slice(0, 1).toUpperCase())}</span>`;
}
const profile = (u: Pick<UserSummary, 'id' | 'username'>) => `/u/${u.id}/${encodeURIComponent(u.username ?? '')}`;
const nameHtml = (u: UserSummary) => `<a class="f-link" href="${profile(u)}" style="${u.color ? `color:${esc(u.color)}` : ''}">${esc(u.displayName)}</a>`;

const ElementBase = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

abstract class ForumElement extends ElementBase {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = '1';
    void this.render();
  }
  protected num(name: string, fallback: number, max: number): number {
    const n = Number(this.getAttribute(name));
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
  }
  protected abstract render(): Promise<void> | void;
}

class ForumUser extends ForumElement {
  render() {
    const v = window.forum?.viewer;
    if (!v || v.isGuest) {
      this.innerHTML = `<div class="f-card f-stack f-gap-sm"><p class="f-muted f-small">${esc(t('Giriş yapmadın.'))}</p><div class="f-row f-gap-sm"><a class="f-btn f-btn-sm" href="/login">${esc(t('Giriş yap'))}</a><a class="f-btn f-btn-sm f-btn-outline" href="/register">${esc(t('Kayıt ol'))}</a></div></div>`;
      return;
    }
    this.innerHTML = `<div class="f-card f-row">${avatar({ displayName: v.displayName, avatarUrl: v.avatarUrl ?? null }, 48)}<div style="min-width:0;flex:1"><a class="f-h3 f-link" href="/u/${v.id}/${encodeURIComponent(v.username)}">${esc(v.displayName)}</a>${v.group ? `<p class="f-small f-muted">${esc(v.group)}</p>` : ''}</div><a class="f-btn f-btn-sm f-btn-outline" href="/settings/profile">${esc(t('Hesabım'))}</a></div>`;
  }
}

class ForumLogin extends ForumElement {
  render() {
    const v = window.forum?.viewer;
    this.innerHTML = !v || v.isGuest ? `<div class="f-row f-gap-sm"><a class="f-btn" href="/login">${esc(t('Giriş yap'))}</a><a class="f-btn f-btn-outline" href="/register">${esc(t('Kayıt ol'))}</a></div>` : '';
  }
}

class ForumStats extends ForumElement {
  async render() {
    this.innerHTML = '<div class="f-skeleton" style="height:4.5rem"></div>';
    try {
      const f = await get<ForumIndex>('/api/forum');
      const items = [
        [f.stats.topics, t('Konu')],
        [f.stats.posts, t('Mesaj')],
        [f.stats.members, t('Üye')],
      ] as const;
      this.innerHTML = `<div class="f-grid-3" style="--f-gap:.75rem">${items.map(([n, l]) => `<div class="f-card-flat f-stat"><b>${esc(formatCompact(n))}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
    } catch {
      this.innerHTML = '';
    }
  }
}

class ForumOnline extends ForumElement {
  async render() {
    try {
      const f = await get<ForumIndex>('/api/forum');
      const online = f.online;
      if (!online) return void (this.innerHTML = '');
      const limit = this.num('limit', 30, 200);
      const users = online.users.slice(0, limit);
      this.innerHTML = `<div class="f-stack f-gap-sm"><p class="f-small f-muted">${esc(t('{n} çevrimiçi', { n: online.total }))}</p><div class="f-row f-gap-sm">${users.map((u) => `<a href="${profile(u)}" title="${esc(u.displayName)}">${avatar(u, 32)}</a>`).join('')}</div></div>`;
    } catch {
      this.innerHTML = '';
    }
  }
}

class ForumRecent extends ForumElement {
  async render() {
    const limit = this.num('limit', 5, 20);
    this.innerHTML = '<div class="f-skeleton" style="height:8rem"></div>';
    try {
      const items = await get<RecentTopicItem[]>(`/api/forum/recent?limit=${limit}`);
      this.innerHTML = items.length
        ? `<div class="f-list">${items
            .map(
              (r) =>
                `<a href="${r.postId ? `/p/${r.postId}` : `/t/${r.topicId}/${esc(r.slug)}`}" class="f-row" style="flex-wrap:nowrap">${avatar(r.author ?? { displayName: r.authorName, avatarUrl: null }, 32)}<span style="min-width:0;flex:1"><span style="display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.title)}</span><span class="f-small f-muted">${esc(r.author?.displayName ?? r.authorName)} · ${esc(timeAgo(r.at))}</span></span></a>`,
            )
            .join('')}</div>`
        : `<p class="f-muted f-small">${esc(t('Henüz konu yok'))}</p>`;
    } catch {
      this.innerHTML = '';
    }
  }
}

class ForumAvatar extends ForumElement {
  async render() {
    const id = Number(this.getAttribute('user'));
    const size = this.num('size', 40, 256);
    if (!id) return;
    try {
      const u = (await get<{ user: UserSummary }>(`/api/users/${id}`)).user;
      this.innerHTML = `<a href="${profile(u)}" title="${esc(u.displayName)}">${avatar(u, size)}</a>${this.hasAttribute('name') ? ` ${nameHtml(u)}` : ''}`;
    } catch {
      this.innerHTML = avatar(null, size);
    }
  }
}

class ForumCountdown extends ForumElement {
  private timer: ReturnType<typeof setInterval> | undefined;
  render() {
    const to = Date.parse(this.getAttribute('to') ?? '');
    if (!Number.isFinite(to)) return;
    const done = this.getAttribute('done') ?? t('Başladı!');
    const tick = () => {
      const left = Math.max(0, to - Date.now());
      if (!left) {
        this.innerHTML = `<p class="f-h3">${esc(done)}</p>`;
        clearInterval(this.timer);
        return;
      }
      const parts = [
        [Math.floor(left / 86_400_000), t('gün')],
        [Math.floor(left / 3_600_000) % 24, t('saat')],
        [Math.floor(left / 60_000) % 60, t('dakika')],
        [Math.floor(left / 1000) % 60, t('saniye')],
      ] as const;
      this.innerHTML = `<div class="f-row f-gap-sm">${parts.map(([n, l]) => `<div class="f-card-flat f-stat" style="min-width:4.5rem;text-align:center;padding:.75rem"><b>${String(n).padStart(2, '0')}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
    };
    tick();
    this.timer = setInterval(tick, 1000);
  }
  disconnectedCallback() {
    clearInterval(this.timer);
  }
}

class ForumTabs extends ForumElement {
  render() {
    const buttons = [...this.querySelectorAll<HTMLButtonElement>('[data-tab]')];
    const show = (key: string) => {
      for (const b of buttons) b.setAttribute('aria-selected', String(b.dataset.tab === key));
      for (const p of this.querySelectorAll<HTMLElement>('[data-f-panel]')) p.hidden = p.dataset.fPanel !== key;
    };
    for (const b of buttons) {
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => show(b.dataset.tab!));
    }
    if (buttons[0]?.dataset.tab) show(buttons[0].dataset.tab);
  }
}

const ELEMENTS: Record<string, CustomElementConstructor> = {
  'forum-user': ForumUser,
  'forum-login': ForumLogin,
  'forum-stats': ForumStats,
  'forum-online': ForumOnline,
  'forum-recent': ForumRecent,
  'forum-avatar': ForumAvatar,
  'forum-countdown': ForumCountdown,
  'forum-tabs': ForumTabs,
};

export function defineForumElements(): void {
  if (typeof customElements === 'undefined') return;
  for (const [name, ctor] of Object.entries(ELEMENTS)) if (!customElements.get(name)) customElements.define(name, ctor);
}
