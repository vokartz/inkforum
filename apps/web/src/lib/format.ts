import { i18n, localeTag, t } from '$lib/i18n.svelte';

/** Biçimlendiriciler dil başına bir kez oluşturulur (Intl nesneleri pahalıdır) */
const cache = new Map<string, { date: Intl.DateTimeFormat; dateTime: Intl.DateTimeFormat; short: Intl.DateTimeFormat; num: Intl.NumberFormat; compact: Intl.NumberFormat; rtf: Intl.RelativeTimeFormat; dayMonth: Intl.DateTimeFormat }>();
function fmt() {
  const tag = localeTag();
  let f = cache.get(tag);
  if (!f) {
    f = {
      date: new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric' }),
      dateTime: new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      short: new Intl.DateTimeFormat(tag, { day: '2-digit', month: '2-digit', year: 'numeric' }),
      num: new Intl.NumberFormat(tag),
      compact: new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 }),
      rtf: new Intl.RelativeTimeFormat(i18n.locale, { numeric: 'auto' }),
      dayMonth: new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long' }),
    };
    cache.set(tag, f);
  }
  return f;
}

export function formatDate(ms: number | null | undefined): string {
  return ms ? fmt().date.format(ms) : '—';
}

export function formatDateTime(ms: number | null | undefined): string {
  return ms ? fmt().dateTime.format(ms) : '—';
}

export function formatShortDate(ms: number | null | undefined): string {
  return ms ? fmt().short.format(ms) : '—';
}

export function formatNumber(n: number | null | undefined): string {
  return fmt().num.format(n ?? 0);
}

export function timeAgo(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return '—';
  const diff = ms - now;
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 86_400_000],
    ['month', 30 * 86_400_000],
    ['week', 7 * 86_400_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, size] of units) {
    if (abs >= size) return fmt().rtf.format(Math.round(diff / size), unit);
  }
  return t('az önce');
}

/** "--05-20" (gün-ay) veya "1995-05-20" biçimlerini okunur hale getirir. */
export function formatBirthdate(value: string | null): string {
  if (!value) return '—';
  const md = value.startsWith('--') ? value.slice(2) : value.slice(5);
  const [m, d] = md.split('-').map(Number);
  const dayMonth = fmt().dayMonth.format(new Date(2000, (m ?? 1) - 1, d ?? 1));
  return value.startsWith('--') ? dayMonth : `${dayMonth} ${value.slice(0, 4)}`;
}

/** datetime-local input değeri ↔ epoch ms */
export function toLocalInput(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
}

/** 7600 → "7,6 B" */
export function formatCompact(n: number | null | undefined): string {
  const v = n ?? 0;
  return v < 10_000 ? fmt().num.format(v) : fmt().compact.format(v);
}
