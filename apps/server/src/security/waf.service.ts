import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup as dnsLookup, reverse as dnsReverse } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';
import { wafConfigInput, type AdminWaf, type WafConfigInput, type WafEvent } from '@forum/shared';
import { CONFIG, type AppConfig } from '../config/config.js';
import { SettingsService } from '../settings/settings.service.js';
import { I18nService } from '../i18n/i18n.service.js';
import type { Locale } from '@forum/shared';
import { CryptoService } from './crypto.service.js';
import { clientIp, isInternalRequest, parseCookies } from '../common/http.js';
import { Errors } from '../common/errors.js';

export const WAF_COOKIE = 'forum_waf';
const POW_DIFFICULTY = 4;

type Decision = { action: 'allow'; setClearance?: boolean } | { action: 'block'; status: number; reason: string } | { action: 'challenge'; reason: string };

export interface WafContext {
  ip: string;
  ua: string;
  method: string;
  url: string;
  path: string;
  cookieHeader: string | undefined;
  hasBearer: boolean;
  hasSession: () => Promise<boolean>;
  locale?: Locale;
}

const RULES: Array<{ name: string; re: RegExp }> = [
  { name: 'SQL enjeksiyonu', re: /(\bunion\b[\s\S]{0,30}\bselect\b|\bselect\b[\s\S]{0,60}\bfrom\b[\s\S]{0,60}\bwhere\b|\bsleep\s*\(\s*\d|\bbenchmark\s*\(|\bwaitfor\s+delay\b|information_schema|\bor\s+1\s*=\s*1\b|'\s*or\s*'[^']*'\s*=\s*'|;\s*drop\s+table\b)/i },
  { name: 'XSS', re: /(<\s*script\b|javascript\s*:|\bon(error|load|mouseover|focus|toggle)\s*=|<\s*iframe\b|<\s*svg[^>]*\bon\w+\s*=|document\.cookie)/i },
  { name: 'Dizin gezinme', re: /(\.\.[/\\]|%2e%2e(%2f|%5c|\/|\\)|\/etc\/(passwd|shadow)|\bboot\.ini\b|\/proc\/self\/)/i },
  { name: 'Tarama', re: /(\/\.(env|git|svn|hg|htaccess|htpasswd|ds_store)(\/|$)|\.(sql|bak|swp|old)$|\/wp-(admin|login|content|includes)|\/phpmyadmin|xmlrpc\.php|\/cgi-bin\/|\/vendor\/phpunit)/i },
];

const STATIC = /^\/(?:_app\/|emoji\/|uploads\/|favicon|robots\.txt$|sitemap[\w-]*\.xml$|manifest)|\.(?:js|mjs|css|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|map)$/i;
const API_EXEMPT = /^\/api\/(?:waf\/|health|oauth\/(?:token|revoke|userinfo|metadata)|embed\/|oembed|og\/|seo\/)/;
const NON_BROWSER = /(curl|wget|python-requests|python-urllib|aiohttp|httpclient|go-http-client|java\/|okhttp|libwww|scrapy|headlesschrome|phantomjs|axios\/|node-fetch)/i;
const PREVIEW_BOTS = /(facebookexternalhit|facebot|twitterbot|discordbot|slackbot|telegrambot|whatsapp|linkedinbot|embedly|redditbot|skypeuripreview|vkshare|pinterestbot|mastodon)/i;
const SEARCH_BOTS: Array<{ ua: RegExp; hosts: string[] }> = [
  { ua: /googlebot|google-inspectiontool|storebot-google|adsbot-google/i, hosts: ['.googlebot.com', '.google.com', '.googleusercontent.com'] },
  { ua: /bingbot|msnbot|bingpreview/i, hosts: ['.search.msn.com'] },
  { ua: /yandex(bot|images)/i, hosts: ['.yandex.ru', '.yandex.net', '.yandex.com'] },
  { ua: /applebot/i, hosts: ['.applebot.apple.com'] },
  { ua: /baiduspider/i, hosts: ['.baidu.com', '.baidu.jp'] },
];

function ipToBig(ip: string): { v: bigint; bits: number } | null {
  if (isIP(ip) === 4) return { v: ip.split('.').reduce((n, o) => (n << 8n) + BigInt(Number(o)), 0n), bits: 32 };
  if (isIP(ip) === 6) {
    const [head, tail] = ip.split('::');
    const h = head ? head.split(':') : [];
    const t = tail !== undefined ? (tail ? tail.split(':') : []) : [];
    const parts = tail !== undefined ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
    return { v: parts.reduce((n, p) => (n << 16n) + BigInt(parseInt(p || '0', 16)), 0n), bits: 128 };
  }
  return null;
}
export function ipMatches(ip: string, rule: string): boolean {
  const [base, lenS] = rule.split('/');
  const a = ipToBig(ip.startsWith('::ffff:') ? ip.slice(7) : ip);
  const b = ipToBig(base!);
  if (!a || !b || a.bits !== b.bits) return false;
  const len = lenS === undefined ? b.bits : Math.min(Number(lenS), b.bits);
  const shift = BigInt(b.bits - len);
  return a.v >> shift === b.v >> shift;
}

@Injectable()
export class WafService {
  private readonly logger = new Logger('WAF');
  private readonly key: Buffer;
  private readonly hits = new Map<string, { n: number; start: number }>();
  private readonly strikes = new Map<string, { n: number; start: number }>();
  private readonly tempBlocks = new Map<string, { until: number; reason: string }>();
  private readonly usedPow = new Map<string, number>();
  private readonly botCache = new Map<string, { ok: boolean; exp: number }>();
  private readonly events: WafEvent[] = [];
  private readonly hourly = new Map<number, { block: number; challenge: number; pass: number; ratelimit: number }>();

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly i18n: I18nService,
  ) {
    this.key = createHash('sha256').update(`${config.secret}:waf`).digest();
  }

  cfg(): WafConfigInput {
    const p = wafConfigInput.safeParse(this.settings.get('waf.config') ?? {});
    return p.success ? p.data : wafConfigInput.parse({});
  }

  active(): boolean {
    return !this.config.wafDisabled && this.cfg().enabled;
  }

  private secret(): string {
    const enc = this.settings.get('waf.secretEnc');
    if (!enc) return '';
    try {
      return this.crypto.decrypt(enc);
    } catch {
      return '';
    }
  }

  private record(action: WafEvent['action'], ctx: Pick<WafContext, 'ip' | 'path' | 'ua'>, reason: string): void {
    const now = Date.now();
    this.events.unshift({ at: now, ip: ctx.ip, action, reason, path: ctx.path.slice(0, 200), ua: ctx.ua.slice(0, 200) });
    if (this.events.length > 300) this.events.length = 300;
    const hour = Math.floor(now / 3_600_000);
    const h = this.hourly.get(hour) ?? { block: 0, challenge: 0, pass: 0, ratelimit: 0 };
    h[action === 'ratelimit' ? 'ratelimit' : action]++;
    this.hourly.set(hour, h);
    for (const k of this.hourly.keys()) if (k < hour - 24) this.hourly.delete(k);
    if (action === 'block') this.logger.warn(`${ctx.ip} engellendi: ${reason} (${ctx.path})`);
  }

  private strike(ip: string, reason: string): void {
    const now = Date.now();
    const s = this.strikes.get(ip);
    const cur = s && now - s.start < 10 * 60_000 ? { n: s.n + 1, start: s.start } : { n: 1, start: now };
    this.strikes.set(ip, cur);
    if (cur.n >= 3) this.tempBlocks.set(ip, { until: now + 3_600_000, reason: `Tekrarlanan saldırı denemesi (${reason})` });
  }

  private suspicious(ip: string, ua: string, limit: number): boolean {
    const s = this.strikes.get(ip);
    const h = this.hits.get(ip);
    return (!!s && Date.now() - s.start < 10 * 60_000) || (!!h && h.n > limit * 0.5) || !ua || NON_BROWSER.test(ua);
  }

  private uaHash(ua: string): string {
    return createHash('sha256').update(ua).digest('base64url').slice(0, 16);
  }

  clearanceValue(ua: string): { value: string; maxAge: number } {
    const hours = this.cfg().clearanceHours;
    const exp = Date.now() + hours * 3_600_000;
    const sig = createHmac('sha256', this.key).update(`${exp}|${this.uaHash(ua)}`).digest('base64url');
    return { value: `${exp}.${sig}`, maxAge: hours * 3_600_000 };
  }

  private validClearance(cookieHeader: string | undefined, ua: string): boolean {
    const raw = parseCookies(cookieHeader)[WAF_COOKIE];
    if (!raw) return false;
    const [expS, sig] = raw.split('.');
    const exp = Number(expS);
    if (!sig || !Number.isFinite(exp) || exp < Date.now()) return false;
    const expect = createHmac('sha256', this.key).update(`${exp}|${this.uaHash(ua)}`).digest('base64url');
    return expect.length === sig.length && timingSafeEqual(Buffer.from(expect), Buffer.from(sig));
  }

  private async verifiedSearchBot(ip: string, ua: string): Promise<boolean> {
    const bot = SEARCH_BOTS.find((b) => b.ua.test(ua));
    if (!bot) return false;
    const cached = this.botCache.get(ip);
    if (cached && cached.exp > Date.now()) return cached.ok;
    let ok = false;
    try {
      const names = await dnsReverse(ip);
      const host = names.find((n) => bot.hosts.some((suffix) => n.endsWith(suffix)));
      if (host) ok = (await dnsLookup(host, { all: true })).some((a) => a.address === ip);
    } catch {
      ok = false;
    }
    if (this.botCache.size > 5000) this.botCache.clear();
    this.botCache.set(ip, { ok, exp: Date.now() + 6 * 3_600_000 });
    return ok;
  }

  async evaluate(ctx: WafContext): Promise<Decision> {
    const cfg = this.cfg();
    const { ip, ua, path } = ctx;
    const isApi = path === '/api' || path.startsWith('/api/');
    const isStatic = !isApi && STATIC.test(path);
    if (cfg.allowIps.some((r) => ipMatches(ip, r))) return { action: 'allow' };

    if (cfg.blockIps.some((r) => ipMatches(ip, r))) return this.deny(ctx, 403, 'Engellenmiş IP adresi');
    const tb = this.tempBlocks.get(ip);
    if (tb && tb.until > Date.now()) return { action: 'block', status: 403, reason: tb.reason };
    if (tb) this.tempBlocks.delete(ip);

    const lowUa = ua.toLowerCase();
    const badUa = cfg.blockUserAgents.find((b) => lowUa.includes(b.toLowerCase()));
    if (badUa) return this.deny(ctx, 403, `Engellenmiş istemci (${badUa})`);

    if (cfg.blockPatterns) {
      let decoded = ctx.url;
      try {
        decoded = decodeURIComponent(ctx.url.replace(/\+/g, ' '));
      } catch {
      }
      const hit = RULES.find((r) => r.re.test(ctx.url) || r.re.test(decoded));
      if (hit) {
        this.strike(ip, hit.name);
        return this.deny(ctx, 403, `Şüpheli istek: ${hit.name}`);
      }
    }

    if (isStatic) return { action: 'allow' };

    const now = Date.now();
    const h = this.hits.get(ip);
    const cur = h && now - h.start < 60_000 ? { n: h.n + 1, start: h.start } : { n: 1, start: now };
    this.hits.set(ip, cur);
    if (this.hits.size > 50_000) this.prune();
    if (cur.n > cfg.rateLimitPerMinute) {
      if (cur.n > cfg.rateLimitPerMinute * 2) this.tempBlocks.set(ip, { until: now + 5 * 60_000, reason: 'Aşırı istek (hız sınırı)' });
      if (cur.n === cfg.rateLimitPerMinute + 1) this.record('ratelimit', ctx, `Dakikada ${cfg.rateLimitPerMinute} isteği aştı`);
      return { action: 'block', status: 429, reason: 'Çok fazla istek gönderildi. Lütfen biraz bekleyin.' };
    }

    if (cfg.mode === 'off') return { action: 'allow' };
    if (isApi && (API_EXEMPT.test(path) || ctx.hasBearer)) return { action: 'allow' };
    if (this.validClearance(ctx.cookieHeader, ua)) return { action: 'allow' };
    if (cfg.mode === 'suspicious' && !this.suspicious(ip, ua, cfg.rateLimitPerMinute)) return { action: 'allow' };
    if (!isApi && ctx.method === 'GET' && cfg.allowSearchBots && (PREVIEW_BOTS.test(ua) || (await this.verifiedSearchBot(ip, ua)))) return { action: 'allow' };
    if (parseCookies(ctx.cookieHeader)[this.config.sessionCookieName] && (await ctx.hasSession())) return { action: 'allow', setClearance: true };
    this.record('challenge', ctx, cfg.mode === 'all' ? 'Herkese doğrulama açık' : 'Şüpheli ziyaretçi');
    return { action: 'challenge', reason: 'Doğrulama gerekli' };
  }

  private deny(ctx: Pick<WafContext, 'ip' | 'path' | 'ua'>, status: number, reason: string): Decision {
    this.record('block', ctx, reason);
    return { action: 'block', status, reason };
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.hits) if (now - v.start > 60_000) this.hits.delete(k);
    for (const [k, v] of this.strikes) if (now - v.start > 10 * 60_000) this.strikes.delete(k);
    for (const [k, v] of this.tempBlocks) if (v.until < now) this.tempBlocks.delete(k);
    for (const [k, v] of this.usedPow) if (v < now) this.usedPow.delete(k);
  }

  issuePow(ua: string): { c: string; d: number; exp: number; sig: string } {
    const c = randomBytes(16).toString('hex');
    const exp = Date.now() + 10 * 60_000;
    const sig = createHmac('sha256', this.key).update(`pow|${c}|${POW_DIFFICULTY}|${exp}|${this.uaHash(ua)}`).digest('hex');
    return { c, d: POW_DIFFICULTY, exp, sig };
  }

  verifyPow(ua: string, p: { c: string; n: string; exp: number; sig: string }): boolean {
    if (!/^[0-9a-f]{32}$/.test(p.c) || !/^\d{1,12}$/.test(p.n) || p.exp < Date.now() || this.usedPow.has(p.c)) return false;
    const expect = createHmac('sha256', this.key).update(`pow|${p.c}|${POW_DIFFICULTY}|${p.exp}|${this.uaHash(ua)}`).digest('hex');
    if (expect.length !== p.sig.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(p.sig))) return false;
    const hash = createHash('sha256').update(`${p.c}:${p.n}`).digest('hex');
    if (!hash.startsWith('0'.repeat(POW_DIFFICULTY))) return false;
    this.usedPow.set(p.c, p.exp);
    return true;
  }

  async verifyCaptcha(token: string, ip: string): Promise<boolean> {
    const cfg = this.cfg();
    const secret = this.secret();
    if (!secret || !token || token.length > 4096) return false;
    const url = cfg.captcha === 'turnstile' ? 'https://challenges.cloudflare.com/turnstile/v0/siteverify' : cfg.captcha === 'hcaptcha' ? 'https://api.hcaptcha.com/siteverify' : null;
    if (!url) return false;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, remoteip: ip, ...(cfg.captcha === 'hcaptcha' && cfg.siteKey ? { sitekey: cfg.siteKey } : {}) }),
        signal: AbortSignal.timeout(8000),
      });
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    } catch (err) {
      this.logger.warn(`Doğrulama sağlayıcısına ulaşılamadı: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  markPassed(ctx: Pick<WafContext, 'ip' | 'path' | 'ua'>): void {
    this.strikes.delete(ctx.ip);
    this.record('pass', ctx, 'Doğrulamayı geçti');
  }

  private esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  }

  private shell(nonce: string, title: string, inner: string, reqId: string, locale: Locale, script = ''): string {
    const s = this.settings;
    const host = this.esc(new URL(this.config.appUrl).host);
    const accent = /^#[0-9a-f]{6}$/i.test(String(s.get('appearance.accentColor'))) ? String(s.get('appearance.accentColor')) : '#9c9c9c';
    const tr = (x: string, params?: Record<string, string>) => this.i18n.t(locale, x, params);
    return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${this.esc(title)} · ${host}</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#313131;--mut:#595959;--line:#d9d9d9;--box:#fafafa;--ok:#0f8a3c;--bad:#c5221f;--a:${accent}}
@media (prefers-color-scheme:dark){:root{--bg:#1b1b1b;--fg:#d9d9d9;--mut:#9a9a9a;--line:#3a3a3a;--box:#232323;--ok:#4ade80;--bad:#f87171}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{max-width:60rem;margin:0 auto;padding:12vh 1.5rem 2rem;min-height:calc(100vh - 5rem)}
h1{font-size:2.4rem;line-height:1.2;font-weight:500;margin:0 0 .6rem;word-break:break-all}
h2{font-size:1.45rem;font-weight:500;margin:0 0 1.4rem;line-height:1.35}
p{color:var(--mut);margin:0 0 1rem;max-width:40rem}
.box{display:flex;align-items:center;gap:.9rem;width:300px;max-width:100%;min-height:65px;padding:0 1rem;border:1px solid var(--line);background:var(--box);border-radius:4px;margin:1.6rem 0 1rem;font-size:.95rem}
.box[hidden]{display:none}
.st{width:24px;height:24px;flex:none;display:grid;place-items:center}
.ring{width:22px;height:22px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--a)}
.run .ring{animation:r .8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}
.ok{color:var(--ok)}.bad{color:var(--bad)}
.cap{margin:1.6rem 0 1rem;min-height:65px}
button{font:inherit;font-size:.9rem;border:1px solid var(--line);background:var(--bg);color:var(--fg);padding:.4rem .9rem;border-radius:4px;cursor:pointer}
footer{max-width:60rem;margin:0 auto;padding:1rem 1.5rem 1.5rem;border-top:1px solid var(--line);font-size:.8rem;color:var(--mut);display:flex;flex-wrap:wrap;gap:.35rem 1.2rem;justify-content:center}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-reduced-motion:reduce){.run .ring{animation:none}}
</style></head><body><main><h1>${host}</h1>${inner}</main>
<footer><span>${this.esc(tr('İstek kimliği'))}: <code>${reqId}</code></span><span>${this.esc(tr('Performans ve güvenlik: {name}', { name: String(s.get('general.forumName')) }))}</span></footer>${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`;
  }

  csp(nonce: string): string {
    return [
      "default-src 'none'",
      `script-src 'nonce-${nonce}' https://challenges.cloudflare.com https://js.hcaptcha.com https://*.hcaptcha.com`,
      'frame-src https://challenges.cloudflare.com https://*.hcaptcha.com',
      "style-src 'unsafe-inline' https://*.hcaptcha.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://*.hcaptcha.com",
      "form-action 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join('; ');
  }

  challengePage(ua: string, returnTo: string, ip: string, locale: Locale = 'tr'): { html: string; nonce: string } {
    const cfg = this.cfg();
    const tr = (x: string, params?: Record<string, string>) => this.i18n.t(locale, x, params);
    const msg = (x: string) => this.i18n.message(locale, x);
    const nonce = randomBytes(16).toString('base64');
    const to = /^\/(?![\\/])[^\s\\]*$/.test(returnTo) ? returnTo : '/';
    const reqId = randomBytes(8).toString('hex');
    void ip;
    const useCaptcha = cfg.captcha !== 'builtin' && !!cfg.siteKey && !!this.settings.get('waf.secretEnc');
    const pow = useCaptcha ? null : this.issuePow(ua);
    const common = `const to=${JSON.stringify(to)};const box=document.getElementById('box'),st=document.getElementById('st'),msg=document.getElementById('msg');
function state(k,t){box.className='box'+(k==='run'?' run':'');st.innerHTML=k==='run'?'<span class="ring"></span>':k==='ok'?'<svg class="ok" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>':'<svg class="bad" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';msg.textContent=t}
async function send(body){try{const r=await fetch('/api/waf/verify',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)});if(r.ok){state('ok',${JSON.stringify(tr('Başarılı!'))});location.replace(to);return true}}catch(e){}state('bad',${JSON.stringify(tr('Doğrulama başarısız.'))});const b=document.createElement('button');b.textContent=${JSON.stringify(msg(cfg.buttonLabel))};b.onclick=()=>location.reload();box.appendChild(b);return false}`;
    const inner = `<h2>${this.esc(msg(cfg.title))}</h2><p>${this.esc(msg(cfg.message))}</p>${
      useCaptcha
        ? `<div class="cap"><div class="${cfg.captcha === 'turnstile' ? 'cf-turnstile' : 'h-captcha'}" data-sitekey="${this.esc(cfg.siteKey)}" data-callback="forumWafPass"></div></div><div class="box" id="box" hidden><span class="st" id="st"></span><span id="msg"></span></div>`
        : `<div class="box run" id="box" role="status" aria-live="polite"><span class="st" id="st"><span class="ring"></span></span><span id="msg">${this.esc(tr('Doğrulanıyor…'))}</span></div>`
    }<noscript><p>${this.esc(tr("Devam etmek için tarayıcınızda JavaScript'i etkinleştirin."))}</p></noscript><p>${this.esc(tr('Devam etmeden önce {host} bağlantınızın güvenliğini gözden geçiriyor.', { host: new URL(this.config.appUrl).host }))}</p>`;
    const sha = `function H(m){const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const b=[];for(let i=0;i<m.length;i++)b.push(m.charCodeAt(i)&255);const l=b.length*8;b.push(128);while(b.length%64!==56)b.push(0);for(let i=7;i>=0;i--)b.push(i>3?0:(l>>>(i*8))&255);
let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;const w=new Array(64);const R=(x,n)=>(x>>>n)|(x<<(32-n));
for(let o=0;o<b.length;o+=64){for(let i=0;i<16;i++)w[i]=(b[o+4*i]<<24)|(b[o+4*i+1]<<16)|(b[o+4*i+2]<<8)|b[o+4*i+3];for(let i=16;i<64;i++){const s0=R(w[i-15],7)^R(w[i-15],18)^(w[i-15]>>>3),s1=R(w[i-2],17)^R(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0}
let a=h0,c=h1,d=h2,e=h3,f=h4,g=h5,hh=h6,k=h7;for(let i=0;i<64;i++){const t1=(k+(R(f,6)^R(f,11)^R(f,25))+((f&g)^(~f&hh))+K[i]+w[i])|0,t2=((R(a,2)^R(a,13)^R(a,22))+((a&c)^(a&d)^(c&d)))|0;k=hh;hh=g;g=f;f=(e+t1)|0;e=d;d=c;c=a;a=(t1+t2)|0}
h0=(h0+a)|0;h1=(h1+c)|0;h2=(h2+d)|0;h3=(h3+e)|0;h4=(h4+f)|0;h5=(h5+g)|0;h6=(h6+hh)|0;h7=(h7+k)|0}return h0>>>0}`;
    const script = useCaptcha
      ? `${common};window.forumWafPass=function(t){box.hidden=false;state('run',${JSON.stringify(tr('Doğrulanıyor…'))});send({kind:'captcha',token:t})};(function(){var s=document.createElement('script');s.src=${JSON.stringify(cfg.captcha === 'turnstile' ? 'https://challenges.cloudflare.com/turnstile/v0/api.js' : 'https://js.hcaptcha.com/1/api.js')};s.async=true;s.defer=true;document.head.appendChild(s)})();`
      : `${common};const P=${JSON.stringify(pow)};${sha}
setTimeout(function(){const lim=16**(8-P.d);let n=0;while(H(P.c+':'+n)>=lim)n++;send({kind:'pow',c:P.c,n:String(n),exp:P.exp,sig:P.sig})},0);`;
    return { html: this.shell(nonce, msg(cfg.title), inner, reqId, locale, script), nonce };
  }

  blockPage(reason: string, status: number, locale: Locale = 'tr'): { html: string; nonce: string } {
    const nonce = randomBytes(16).toString('base64');
    const tr = (x: string) => this.i18n.t(locale, x);
    const title = tr(status === 429 ? 'Çok fazla istek gönderildi' : 'Erişiminiz engellendi');
    const reqId = randomBytes(8).toString('hex');
    const inner = `<h2>${this.esc(title)}</h2><p>${this.esc(this.i18n.message(locale, reason))}</p><p>${this.esc(tr('Bu sitenin güvenlik duvarı isteğinizi durdurdu. Bir hata olduğunu düşünüyorsanız site yönetimine yukarıdaki alan adını ve aşağıdaki istek kimliğini iletin.'))}</p>`;
    return { html: this.shell(nonce, title, inner, reqId, locale), nonce };
  }

  context(req: Request, hasSession: () => Promise<boolean>): WafContext {
    const auth = req.headers.authorization;
    return {
      ip: clientIp(req) ?? '0.0.0.0',
      ua: String(req.headers['user-agent'] ?? ''),
      method: req.method,
      url: req.originalUrl ?? req.url,
      path: req.path,
      cookieHeader: req.headers.cookie,
      hasBearer: typeof auth === 'string' && /^bearer\s+\S+/i.test(auth),
      hasSession,
      locale: this.i18n.resolve({ cookie: req.headers.cookie, acceptLanguage: req.headers['accept-language'] }),
    };
  }

  setClearance(res: Response, ua: string): void {
    const c = this.clearanceValue(ua);
    res.cookie(WAF_COOKIE, c.value, { httpOnly: true, sameSite: 'lax', secure: this.config.secureCookies, path: '/', maxAge: c.maxAge });
  }

  async middleware(req: Request, res: Response, next: NextFunction, hasSession: () => Promise<boolean>): Promise<void> {
    if (!this.active() || isInternalRequest(req)) return next();
    const ctx = this.context(req, hasSession);
    const d = await this.evaluate(ctx);
    if (d.action === 'allow') {
      if (d.setClearance) this.setClearance(res, ctx.ua);
      return next();
    }
    const isApi = ctx.path.startsWith('/api/');
    res.setHeader('Cache-Control', 'no-store');
    if (d.action === 'block') {
      if (d.status === 429) res.setHeader('Retry-After', '60');
      if (isApi) {
        res.status(d.status).json({ error: { code: d.status === 429 ? 'RATE_LIMITED' : 'WAF_BLOCKED', message: d.reason } });
        return;
      }
      const p = this.blockPage(d.reason, d.status, ctx.locale);
      res.setHeader('Content-Security-Policy', this.csp(p.nonce));
      res.status(d.status).type('html').send(p.html);
      return;
    }
    if (isApi || ctx.method !== 'GET') {
      res.status(403).json({ error: { code: 'WAF_CHALLENGE', message: 'Güvenlik doğrulaması gerekli; sayfayı yenileyin.' } });
      return;
    }
    const p = this.challengePage(ctx.ua, ctx.url, ctx.ip, ctx.locale);
    res.setHeader('Content-Security-Policy', this.csp(p.nonce));
    res.status(403).type('html').send(p.html);
  }

  admin(): AdminWaf {
    const cfg = this.cfg();
    const now = Date.now();
    let blocked = 0;
    let challenged = 0;
    let passed = 0;
    let rateLimited = 0;
    for (const [hour, h] of this.hourly) {
      if (hour < Math.floor(now / 3_600_000) - 24) continue;
      blocked += h.block;
      challenged += h.challenge;
      passed += h.pass;
      rateLimited += h.ratelimit;
    }
    const { secretKey: _s, ...rest } = cfg;
    return {
      config: { ...rest, hasSecret: !!this.settings.get('waf.secretEnc') },
      stats: {
        blocked24h: blocked,
        challenged24h: challenged,
        passed24h: passed,
        rateLimited24h: rateLimited,
        activeBlocks: [...this.tempBlocks].filter(([, v]) => v.until > now).map(([ip, v]) => ({ ip, until: v.until, reason: v.reason })).slice(0, 100),
      },
      events: this.events.slice(0, 150),
      forcedOff: this.config.wafDisabled,
    };
  }

  async save(input: WafConfigInput, actorId: number): Promise<void> {
    const { secretKey, ...cfg } = input;
    const patch: Record<string, unknown> = { 'waf.config': cfg };
    if (secretKey) patch['waf.secretEnc'] = this.crypto.encrypt(secretKey);
    if (cfg.captcha !== 'builtin' && (!cfg.siteKey || (!secretKey && !this.settings.get('waf.secretEnc')))) {
      throw Errors.field('siteKey', 'Bu doğrulama türü için site anahtarı ve gizli anahtar gerekli.');
    }
    await this.settings.update(patch as never, actorId, { allowHidden: true });
  }

  unblock(ip: string): void {
    this.tempBlocks.delete(ip);
    this.strikes.delete(ip);
    this.hits.delete(ip);
  }
}
