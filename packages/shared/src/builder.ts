import { z } from 'zod';
import type { ForumStats, IconNode, OnlineSummary, RecentTopicItem } from './forum.js';
import type { UserSummary } from './dto.js';

const LINK = /^(https?:\/\/[^\s]+|\/(?![\\/])[^\s\\]*|#[\w-]*|mailto:[^\s]+|(?!(?:javascript|data|vbscript|file):)[a-z][a-z0-9+.-]{1,20}:\/\/[^\s]+)$/i;
const link = z.string().trim().max(500).regex(LINK, 'Geçersiz bağlantı.');
const optLink = z.union([link, z.literal('')]).default('');
const image = z.union([z.string().trim().max(500).regex(/^(https:\/\/|\/uploads\/)[^\s"'()<>]+$/, 'Görsel bağlantısı https:// ile başlamalı.'), z.literal('')]).default('');
const text = (max: number) => z.string().max(max).default('');

export const BLOCK_BACKGROUNDS = ['none', 'muted', 'card', 'accent', 'dark', 'image'] as const;

const base = {
  id: z.string().trim().min(1).max(40),
  background: z.enum(BLOCK_BACKGROUNDS).default('none'),
  bgImage: image,
  width: z.enum(['narrow', 'contained', 'full']).default('contained'),
  spacing: z.enum(['none', 'sm', 'md', 'lg']).default('md'),
  align: z.enum(['left', 'center']).default('left'),
  visibility: z.enum(['all', 'members', 'guests']).default('all'),
  anchor: z.union([z.string().trim().max(40).regex(/^[a-z0-9-]+$/, 'Yalnızca küçük harf, rakam, tire.'), z.literal('')]).default(''),
  animation: z.enum(['none', 'fade', 'up', 'zoom']).default('up'),
};

const navLink = z.object({ label: z.string().trim().min(1, 'Bağlantı adı gerekli.').max(40), url: link });

const button = z.object({ label: z.string().trim().min(1, 'Düğme yazısı gerekli.').max(40), url: link, style: z.enum(['primary', 'outline', 'ghost']).default('primary'), newTab: z.boolean().default(false) });

export const builderBlockSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('hero'),
    eyebrow: text(60),
    title: text(160),
    text: text(600),
    image,
    overlay: z.number().int().min(0).max(90).default(55),
    height: z.enum(['sm', 'md', 'lg', 'screen']).default('lg'),
    showLogo: z.boolean().default(false),
    buttons: z.array(button).max(3).default([]),
  }),
  z.object({ ...base, type: z.literal('text'), title: text(160), body: text(50_000) }),
  z.object({
    ...base,
    type: z.literal('features'),
    title: text(160),
    subtitle: text(400),
    columns: z.number().int().min(2).max(4).default(3),
    items: z.array(z.object({ icon: z.string().trim().max(40).default(''), title: z.string().trim().max(80).default(''), text: text(400), url: optLink })).max(12).default([]),
  }),
  z.object({ ...base, type: z.literal('image'), url: image, alt: text(200), caption: text(200), link: optLink, rounded: z.boolean().default(true) }),
  z.object({
    ...base,
    type: z.literal('gallery'),
    title: text(160),
    columns: z.number().int().min(2).max(5).default(3),
    layout: z.enum(['grid', 'masonry', 'carousel']).default('grid'),
    autoplay: z.boolean().default(true),
    images: z.array(z.object({ url: image, caption: text(160) })).max(40).default([]),
  }),
  z.object({
    ...base,
    type: z.literal('navbar'),
    brand: text(60),
    showLogo: z.boolean().default(true),
    links: z.array(navLink).max(8).default([]),
    buttons: z.array(button).max(2).default([]),
    showAuth: z.boolean().default(true),
    sticky: z.boolean().default(true),
    transparent: z.boolean().default(false),
  }),
  z.object({
    ...base,
    type: z.literal('footer'),
    text: text(400),
    showLogo: z.boolean().default(true),
    showSocial: z.boolean().default(true),
    columns: z.array(z.object({ title: z.string().trim().max(40).default(''), links: z.array(navLink).max(8).default([]) })).max(4).default([]),
  }),
  z.object({
    ...base,
    type: z.literal('split'),
    eyebrow: text(60),
    title: text(160),
    body: text(20_000),
    image,
    imageSide: z.enum(['left', 'right']).default('right'),
    buttons: z.array(button).max(3).default([]),
  }),
  z.object({
    ...base,
    type: z.literal('testimonials'),
    title: text(160),
    items: z.array(z.object({ quote: text(600), name: z.string().trim().max(60).default(''), role: z.string().trim().max(60).default(''), avatar: image })).max(12).default([]),
  }),
  z.object({
    ...base,
    type: z.literal('pricing'),
    title: text(160),
    subtitle: text(400),
    plans: z
      .array(
        z.object({
          name: z.string().trim().max(60).default(''),
          price: z.string().trim().max(30).default(''),
          period: z.string().trim().max(30).default(''),
          description: text(300),
          features: z.array(z.string().trim().max(120)).max(15).default([]),
          buttonLabel: z.string().trim().max(40).default(''),
          buttonUrl: optLink,
          highlighted: z.boolean().default(false),
          badge: z.string().trim().max(30).default(''),
        }),
      )
      .max(4)
      .default([]),
  }),
  z.object({
    ...base,
    type: z.literal('timeline'),
    title: text(160),
    items: z.array(z.object({ date: z.string().trim().max(40).default(''), title: z.string().trim().max(120).default(''), text: text(600) })).max(30).default([]),
  }),
  z.object({
    ...base,
    type: z.literal('social'),
    title: text(160),
    text: text(400),
    links: z.array(z.object({ platform: z.string().trim().max(20), url: link, label: z.string().trim().max(40).default('') })).max(10).default([]),
  }),
  z.object({
    ...base,
    type: z.literal('logos'),
    title: text(160),
    grayscale: z.boolean().default(true),
    items: z.array(z.object({ image, name: z.string().trim().max(60).default(''), url: optLink })).max(24).default([]),
  }),
  z.object({ ...base, type: z.literal('video'), title: text(160), url: z.union([link, z.literal('')]).default('') }),
  z.object({ ...base, type: z.literal('stats'), title: text(160), show: z.array(z.enum(['members', 'topics', 'posts', 'online'])).min(1).max(4).default(['members', 'topics', 'posts', 'online']) }),
  z.object({ ...base, type: z.literal('latest'), title: text(160), limit: z.number().int().min(3).max(12).default(6) }),
  z.object({ ...base, type: z.literal('boards'), title: text(160) }),
  z.object({
    ...base,
    type: z.literal('server'),
    name: text(120),
    description: text(600),
    address: text(120),
    connectUrl: optLink,
    status: z.enum(['online', 'maintenance', 'soon', 'none']).default('online'),
    players: text(40),
    image,
    tags: z.array(z.string().trim().max(30)).max(8).default([]),
  }),
  z.object({ ...base, type: z.literal('team'), title: text(160), groupId: z.number().int().positive().nullable().default(null), limit: z.number().int().min(1).max(48).default(12) }),
  z.object({ ...base, type: z.literal('cta'), title: text(160), text: text(600), buttons: z.array(button).max(3).default([]) }),
  z.object({ ...base, type: z.literal('faq'), title: text(160), items: z.array(z.object({ q: z.string().trim().max(200).default(''), a: text(4000) })).max(40).default([]) }),
  z.object({ ...base, type: z.literal('countdown'), title: text(160), text: text(400), target: z.number().int().min(0).default(0), doneText: text(160) }),
  z.object({ ...base, type: z.literal('html'), html: text(100_000) }),
  z.object({ ...base, type: z.literal('spacer'), size: z.enum(['sm', 'md', 'lg']).default('md'), line: z.boolean().default(false) }),
]);
export type BuilderBlock = z.output<typeof builderBlockSchema>;
export type BuilderBlockType = BuilderBlock['type'];

export const builderDocSchema = z.object({
  version: z.literal(1).default(1),
  blocks: z.array(builderBlockSchema).max(80, 'Bir sayfada en fazla 80 blok olabilir.'),
  css: z.string().max(50_000, 'CSS en fazla 50.000 karakter olabilir.').default(''),
});
export type BuilderDoc = z.output<typeof builderDocSchema>;

export const BUILDER_BLOCKS: Record<BuilderBlockType, { label: string; description: string; icon: string; group: 'layout' | 'basic' | 'media' | 'dynamic' | 'advanced' }> = {
  navbar: { label: 'Menü çubuğu', description: 'Sayfanın üst menüsü: logo, bağlantılar, giriş / kayıt; yapışkan ya da kapağın üzerinde şeffaf.', icon: 'navigation-arrow', group: 'layout' },
  footer: { label: 'Alt bilgi', description: 'Logo, bağlantı sütunları, sosyal medya ve telif yazısı.', icon: 'rows', group: 'layout' },
  hero: { label: 'Kapak (hero)', description: 'Büyük başlık, açıklama, arka plan görseli ve düğmeler.', icon: 'flag-banner', group: 'basic' },
  text: { label: 'Metin', description: 'Başlıklı zengin metin (BBCode).', icon: 'text-aa', group: 'basic' },
  split: { label: 'Görsel + metin', description: 'Yan yana görsel ve metin; tanıtım bölümleri için.', icon: 'columns', group: 'basic' },
  timeline: { label: 'Zaman çizelgesi', description: 'Güncelleme notları, yol haritası, tarihçe.', icon: 'path', group: 'basic' },
  pricing: { label: 'Paketler / fiyatlar', description: 'VIP, bağış ya da üyelik paketleri; öne çıkan paket.', icon: 'tag', group: 'basic' },
  testimonials: { label: 'Yorumlar', description: 'Oyuncu ve üye yorumları.', icon: 'quotes', group: 'basic' },
  features: { label: 'Özellik kartları', description: 'Simgeli kısa kartlar: sunucunun öne çıkanları.', icon: 'squares-four', group: 'basic' },
  cta: { label: 'Çağrı şeridi', description: 'Kısa mesaj ve düğmeler (Kayıt ol, Discord…).', icon: 'megaphone', group: 'basic' },
  faq: { label: 'Sık sorulanlar', description: 'Açılır soru-cevap listesi.', icon: 'question', group: 'basic' },
  image: { label: 'Görsel', description: 'Tek görsel, açıklama ve bağlantı.', icon: 'image', group: 'media' },
  gallery: { label: 'Galeri', description: 'Izgara, döşeme ya da kaydırmalı görseller; tıklayınca büyür.', icon: 'images', group: 'media' },
  logos: { label: 'Logolar / ortaklar', description: 'Sponsor ve ortak logoları.', icon: 'handshake', group: 'media' },
  social: { label: 'Sosyal bağlantılar', description: 'Discord, YouTube, Instagram… büyük düğmeler.', icon: 'share-network', group: 'media' },
  video: { label: 'Video / gömülü içerik', description: 'YouTube, Twitch, Spotify…', icon: 'youtube-logo', group: 'media' },
  server: { label: 'Sunucu kartı', description: 'Oyun sunucusu adresi (kopyala), durum, oyuncu sayısı ve bağlan düğmesi.', icon: 'game-controller', group: 'dynamic' },
  stats: { label: 'İstatistikler', description: 'Canlı üye, konu, mesaj ve çevrimiçi sayıları.', icon: 'chart-line-up', group: 'dynamic' },
  latest: { label: 'Son konular', description: 'Forumdaki en son konular (canlı).', icon: 'chats-circle', group: 'dynamic' },
  boards: { label: 'Forum bölümleri', description: 'Kategoriler ve bölümlere hızlı bağlantılar.', icon: 'list-bullets', group: 'dynamic' },
  team: { label: 'Ekip', description: 'Bir grubun üyeleri (ör. Yönetim ekibi).', icon: 'users-three', group: 'dynamic' },
  countdown: { label: 'Geri sayım', description: 'Açılış veya etkinlik için geri sayım.', icon: 'timer', group: 'dynamic' },
  html: { label: 'Özel HTML', description: 'Kendi HTML / JS kodun ("Kod düzenleme" yetkisi gerekir).', icon: 'code', group: 'advanced' },
  spacer: { label: 'Boşluk / çizgi', description: 'Bloklar arasına boşluk veya ayırıcı çizgi.', icon: 'arrows-vertical', group: 'advanced' },
};

export type ResolvedBlock = BuilderBlock & {
  html?: string;
  faqHtml?: string[];
  itemIcons?: Array<IconNode | null>;
  stats?: ForumStats & { online: number };
  topics?: RecentTopicItem[];
  categories?: Array<{ id: number; name: string; boards: Array<{ id: number; name: string; slug: string; description: string | null; topicCount: number; postCount: number }> }>;
  members?: UserSummary[];
  group?: { name: string; color: string | null } | null;
  onlineSummary?: Pick<OnlineSummary, 'total' | 'guests'> | null;
};

export function newBlockId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultBlock(type: BuilderBlockType): BuilderBlock {
  const samples: Partial<Record<BuilderBlockType, Record<string, unknown>>> = {
    navbar: { links: [{ label: 'Forum', url: '/forum' }, { label: 'Wiki', url: '/wiki' }], width: 'full', spacing: 'none', animation: 'none' },
    footer: { text: '', width: 'full', background: 'card', spacing: 'sm', columns: [{ title: 'Topluluk', links: [{ label: 'Forum', url: '/forum' }, { label: 'Üyeler', url: '/members' }] }, { title: 'Yardım', links: [{ label: 'Wiki', url: '/wiki' }, { label: 'Kurallar', url: '/policies/rules' }] }] },
    split: { eyebrow: 'Hakkımızda', title: 'Bizi farklı kılan ne?', body: 'Buraya tanıtım metni yazın. [b]Kalın[/b] ve bağlantı kullanılabilir.', buttons: [{ label: 'Daha fazla', url: '/wiki', style: 'outline' }] },
    testimonials: { title: 'Oyuncularımız ne diyor?', align: 'center', items: [{ quote: 'Uzun zamandır oynadığım en iyi topluluk.', name: 'Ahmet', role: 'Oyuncu' }, { quote: 'Yönetim çok ilgili, her soruna hızlı dönüş.', name: 'Elif', role: 'Üye' }] },
    pricing: { title: 'Paketler', align: 'center', plans: [{ name: 'Başlangıç', price: '₺49', period: '/ay', features: ['Özel rozet', 'Renkli isim'], buttonLabel: 'Satın al', buttonUrl: '/' }, { name: 'VIP', price: '₺99', period: '/ay', features: ['Tüm başlangıç özellikleri', 'Öncelikli destek', 'Özel araç'], buttonLabel: 'Satın al', buttonUrl: '/', highlighted: true, badge: 'En popüler' }] },
    timeline: { title: 'Güncelleme notları', items: [{ date: 'Eylül 2026', title: 'Yeni sezon', text: 'Yeni meslekler ve harita güncellemesi.' }, { date: 'Ağustos 2026', title: 'Açılış', text: 'Sunucu kapılarını açtı.' }] },
    social: { title: 'Bizi takip et', align: 'center', links: [{ platform: 'discord', url: 'https://discord.gg/', label: 'Discord' }, { platform: 'youtube', url: 'https://youtube.com/', label: 'YouTube' }] },
    logos: { title: 'Ortaklarımız', align: 'center' },
    hero: { title: 'Topluluğumuza hoş geldin', text: 'Kısa bir tanıtım yazısı: sunucunuzu veya forumunuzu birkaç cümleyle anlatın.', buttons: [{ label: 'Foruma git', url: '/forum', style: 'primary' }, { label: 'Kayıt ol', url: '/register', style: 'outline' }], background: 'dark', align: 'center' },
    text: { title: 'Hakkımızda', body: 'Buraya metin yazın. [b]Kalın[/b], [i]italik[/i], bağlantı ve listeler kullanılabilir.' },
    features: {
      title: 'Neden biz?',
      items: [
        { icon: 'lightning', title: 'Hızlı', text: 'Kısa açıklama.' },
        { icon: 'shield-check', title: 'Güvenli', text: 'Kısa açıklama.' },
        { icon: 'users-three', title: 'Aktif topluluk', text: 'Kısa açıklama.' },
      ],
    },
    cta: { title: 'Aramıza katıl', text: 'Hemen üye ol ve topluluğun bir parçası ol.', buttons: [{ label: 'Kayıt ol', url: '/register', style: 'primary' }], background: 'accent', align: 'center' },
    faq: { title: 'Sık sorulan sorular', items: [{ q: 'Nasıl kayıt olurum?', a: 'Sağ üstteki Kayıt ol düğmesine tıklayın.' }] },
    server: { name: 'Sunucumuz', description: 'Sunucunuzu tanıtın.', address: 'play.ornek.com', status: 'online', players: '' },
    stats: { title: 'Topluluk' },
    latest: { title: 'Forumdan son konular' },
    boards: { title: 'Forum bölümleri' },
    team: { title: 'Yönetim ekibi' },
    countdown: { title: 'Açılışa kalan süre', target: Date.now() + 7 * 86_400_000, doneText: 'Açıldık!' },
    gallery: { title: 'Galeri' },
    video: { title: '' },
    spacer: {},
  };
  return builderBlockSchema.parse({ id: newBlockId(), type, ...(samples[type] ?? {}) });
}
