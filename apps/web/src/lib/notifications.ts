import ClipboardIcon from 'phosphor-svelte/lib/ClipboardText';
import LifebuoyIcon from 'phosphor-svelte/lib/Lifebuoy';
import type { IconComponent } from './utils';
import { t } from '$lib/i18n.svelte';
import WarningIcon from 'phosphor-svelte/lib/Warning';
import TrophyIcon from 'phosphor-svelte/lib/Trophy';
import UsersIcon from 'phosphor-svelte/lib/UsersThree';
import QuotesIcon from 'phosphor-svelte/lib/Quotes';
import AtIcon from 'phosphor-svelte/lib/At';
import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircle';
import MegaphoneIcon from 'phosphor-svelte/lib/Megaphone';
import BellIcon from 'phosphor-svelte/lib/Bell';
import HeartIcon from 'phosphor-svelte/lib/Heart';
import ChatsIcon from 'phosphor-svelte/lib/ChatsCircle';

export interface NotificationItem {
  id: number;
  type: string;
  actorId: number | null;
  data: Record<string, unknown>;
  readAt: number | null;
  createdAt: number;
}

/** Bildirimi okunur metne ve bağlantıya çevirir. */
export function describeNotification(n: NotificationItem): { text: string; href: string | null } {
  const d = n.data as Record<string, string | number | null | undefined>;
  switch (n.type) {
    case 'warning.issued':
      return { text: t('Size {points} puanlık bir uyarı verildi: {reason}', { points: d.points, reason: d.reason ?? '' }), href: '/settings/warnings' };
    case 'warning.revoked':
      return { text: t('{points} puanlık bir uyarınız geri alındı.', { points: d.points }), href: '/settings/warnings' };
    case 'achievement.awarded':
      return { text: t('Yeni başarı kazandınız: {name} (+{points} puan)', { name: d.name, points: d.points }), href: '/settings/achievements' };
    case 'group.added':
      return {
        text: d.expiresAt
          ? t('"{group}" grubuna eklendiniz (süreli üyelik).', { group: d.groupName ?? t('bir') })
          : t('"{group}" grubuna eklendiniz.', { group: d.groupName ?? t('bir') }),
        href: d.groupId ? `/groups/${d.groupId}` : null,
      };
    case 'group.removed':
      return {
        text: d.expired
          ? t('"{group}" grubundaki üyeliğinizin süresi doldu.', { group: d.groupName })
          : t('"{group}" grubundan çıkarıldınız.', { group: d.groupName }),
        href: d.groupId ? `/groups/${d.groupId}` : null,
      };
    case 'group.request.new':
      return { text: t('"{group}" grubuna yeni bir katılım isteği var.', { group: d.groupName }), href: d.groupId ? `/groups/${d.groupId}/manage` : null };
    case 'group.request.approved':
      return { text: t('"{group}" grubuna katılım isteğiniz onaylandı.', { group: d.groupName }), href: d.groupId ? `/groups/${d.groupId}` : null };
    case 'group.request.rejected':
      return {
        text:
          t('"{group}" grubuna katılım isteğiniz reddedildi.', { group: d.groupName }) +
          (d.response ? ` ${t('Yanıt: {response}', { response: d.response })}` : ''),
        href: d.groupId ? `/groups/${d.groupId}` : null,
      };
    case 'account.approved':
      return { text: t('Üyeliğiniz onaylandı.'), href: null };
    case 'system.message':
      return { text: String(d.message ?? ''), href: null };
    case 'forum.quote':
      return {
        text: t('{actor}, "{topic}" konusunda mesajınızı alıntıladı.', { actor: d.actorName ?? t('Bir üye'), topic: d.topicTitle }),
        href: d.postId ? `/p/${d.postId}` : null,
      };
    case 'forum.mention':
      return {
        text: t('{actor}, "{topic}" konusunda sizden bahsetti.', { actor: d.actorName ?? t('Bir üye'), topic: d.topicTitle }),
        href: d.postId ? `/p/${d.postId}` : null,
      };
    case 'forum.reaction':
      return {
        text: t('{actor}, "{topic}" konusundaki mesajına {emoji} tepkisi verdi.', { actor: d.actorName ?? t('Bir üye'), topic: d.topicTitle, emoji: d.emoji ?? '' }),
        href: d.postId ? `/p/${d.postId}` : null,
      };
    case 'forum.reply':
      return {
        text: t('{actor}, takip ettiğin "{topic}" konusuna yanıt yazdı.', { actor: d.actorName ?? t('Bir üye'), topic: d.topicTitle }),
        href: d.postId ? `/p/${d.postId}` : null,
      };
    case 'application.new':
      return {
        text: t('{actor}, "{form}" formuna başvurdu.', { actor: d.actorName ?? t('Bir üye'), form: d.formTitle }),
        href: d.applicationId ? `/applications/view/${d.applicationId}` : null,
      };
    case 'application.decided':
      return {
        text:
          (d.approved ? t('"{form}" başvurunuz onaylandı.', { form: d.formTitle }) : t('"{form}" başvurunuz reddedildi.', { form: d.formTitle })) +
          (d.reason ? ` ${t('Not: {reason}', { reason: d.reason })}` : ''),
        href: d.applicationId ? `/applications/view/${d.applicationId}` : null,
      };
    case 'application.note':
      return { text: t('"{form}" başvurunuza yanıt yazıldı.', { form: d.formTitle }), href: d.applicationId ? `/applications/view/${d.applicationId}` : null };
    case 'ticket.new':
      return {
        text: t('{actor} yeni bir destek talebi açtı: "{subject}"', { actor: d.actorName ?? t('Bir üye'), subject: d.subject }),
        href: d.ticketId ? `/tickets/${d.ticketId}` : null,
      };
    case 'ticket.reply':
      return { text: t('"{subject}" destek talebine yanıt yazıldı.', { subject: d.subject }), href: d.ticketId ? `/tickets/${d.ticketId}` : null };
    case 'ticket.status':
      return {
        text: t('"{subject}" destek talebinin durumu: {status}', { subject: d.subject, status: d.statusLabel ? t(String(d.statusLabel)) : '' }),
        href: d.ticketId ? `/tickets/${d.ticketId}` : null,
      };
    case 'system.update':
      return { text: t('Yeni InkForum sürümü yayımlandı: v{version}. Sürüm notlarını incele.', { version: d.version }), href: '/admin/updates' };
    case 'system.updated':
      return { text: t('InkForum v{version} sürümüne güncellendi.', { version: d.version }), href: '/admin/updates' };
    case 'forum.topicAccess':
      return { text: t('{actor} sizi gizli "{topic}" konusuna ekledi.', { actor: d.actorName ?? t('Bir yetkili'), topic: d.topicTitle }), href: d.topicId ? `/t/${d.topicId}` : null };
    case 'forum.postApproved':
      return { text: t('"{topic}" konusundaki mesajınız onaylandı.', { topic: d.topicTitle }), href: d.postId ? `/p/${d.postId}` : null };
    default:
      return { text: t('Yeni bir bildiriminiz var.'), href: null };
  }
}

/** Bildirim türüne göre ikon ve renk (liste ve açılır pencerede). */
export function notificationVisual(n: NotificationItem): { icon: IconComponent; color: string } {
  const t = n.type;
  if (t.startsWith('warning.')) return { icon: WarningIcon, color: 'var(--destructive)' };
  if (t === 'achievement.awarded') return { icon: TrophyIcon, color: 'var(--warning)' };
  if (t.startsWith('group.')) return { icon: UsersIcon, color: 'var(--primary)' };
  if (t === 'forum.quote') return { icon: QuotesIcon, color: 'var(--primary)' };
  if (t === 'forum.reaction') return { icon: HeartIcon, color: 'var(--destructive)' };
  if (t === 'forum.mention') return { icon: AtIcon, color: 'var(--primary)' };
  if (t === 'forum.reply') return { icon: ChatsIcon, color: 'var(--primary)' };
  if (t === 'forum.topicAccess') return { icon: UsersIcon, color: 'var(--warning)' };
  if (t === 'forum.postApproved' || t === 'account.approved') return { icon: CheckCircleIcon, color: 'var(--success)' };
  if (t === 'system.update' || t === 'system.updated') return { icon: MegaphoneIcon, color: 'var(--success)' };
  if (t === 'system.message') return { icon: MegaphoneIcon, color: 'var(--primary)' };
  if (t === 'application.decided') return { icon: CheckCircleIcon, color: n.data.approved ? 'var(--success)' : 'var(--destructive)' };
  if (t.startsWith('application.')) return { icon: ClipboardIcon, color: 'var(--primary)' };
  if (t.startsWith('ticket.')) return { icon: LifebuoyIcon, color: 'var(--primary)' };
  return { icon: BellIcon, color: 'var(--muted-foreground)' };
}
