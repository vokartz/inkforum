import type { GroupKind, GroupVisibility, WarningActionMode, WarningActionType } from '@forum/db';

export interface DefaultGroup {
  systemKey: string | null;
  name: string;
  description: string;
  color: string | null;
  iconCount: number;
  kind: GroupKind;
  minPosts: number | null;
  visibility: GroupVisibility;
  isProtected: boolean;
  sortOrder: number;
}

export const SYSTEM_GROUPS: DefaultGroup[] = [
  {
    systemKey: 'admin',
    name: 'Yönetici',
    description: 'Forumun tüm yönetim yetkilerine sahip üyeler.',
    color: '#dc2626',
    iconCount: 5,
    kind: 'regular',
    minPosts: null,
    visibility: 'visible',
    isProtected: true,
    sortOrder: 1,
  },
  {
    systemKey: 'global_moderator',
    name: 'Global Moderatör',
    description: 'Tüm bölümlerde moderasyon yapabilen üyeler.',
    color: '#2563eb',
    iconCount: 4,
    kind: 'regular',
    minPosts: null,
    visibility: 'visible',
    isProtected: true,
    sortOrder: 2,
  },
  {
    systemKey: 'moderator',
    name: 'Moderatör',
    description: 'Belirli bölümlerde moderasyon yapan üyeler (bölüm bazında atanır).',
    color: '#16a34a',
    iconCount: 3,
    kind: 'system',
    minPosts: null,
    visibility: 'visible',
    isProtected: true,
    sortOrder: 3,
  },
  {
    systemKey: 'member',
    name: 'Üye',
    description: 'Tüm kayıtlı üyeler bu gruba dahildir.',
    color: null,
    iconCount: 0,
    kind: 'system',
    minPosts: null,
    visibility: 'hidden',
    isProtected: true,
    sortOrder: 98,
  },
  {
    systemKey: 'guest',
    name: 'Misafir',
    description: 'Giriş yapmamış ziyaretçiler.',
    color: null,
    iconCount: 0,
    kind: 'system',
    minPosts: null,
    visibility: 'hidden',
    isProtected: true,
    sortOrder: 99,
  },
];

export const POST_GROUPS: DefaultGroup[] = [
  { systemKey: null, name: 'Yeni Üye', description: 'Topluluğa yeni katılanlar.', color: null, iconCount: 1, kind: 'post_count', minPosts: 0, visibility: 'visible', isProtected: false, sortOrder: 10 },
  { systemKey: null, name: 'Aktif Üye', description: '50 ve üzeri mesaj.', color: null, iconCount: 2, kind: 'post_count', minPosts: 50, visibility: 'visible', isProtected: false, sortOrder: 11 },
  { systemKey: null, name: 'Kıdemli Üye', description: '250 ve üzeri mesaj.', color: null, iconCount: 3, kind: 'post_count', minPosts: 250, visibility: 'visible', isProtected: false, sortOrder: 12 },
  { systemKey: null, name: 'Efsane Üye', description: '1000 ve üzeri mesaj.', color: '#b45309', iconCount: 4, kind: 'post_count', minPosts: 1000, visibility: 'visible', isProtected: false, sortOrder: 13 },
];

export const DEFAULT_POLICIES = [
  {
    key: 'terms',
    isRequired: true,
    showOnRegister: true,
    sortOrder: 1,
    title: 'Kullanım Koşulları',
    bodyMd: `[size=5][b]Kullanım Koşulları[/b][/size]

Bu foruma kayıt olarak aşağıdaki koşulları kabul etmiş olursunuz.

[list=1]
[*]Paylaştığınız içeriklerden siz sorumlusunuz.
[*]Yasalara aykırı, hakaret içeren veya başkalarının haklarını ihlal eden içerik paylaşamazsınız.
[*]Yöneticiler kurallara aykırı içerikleri kaldırma ve hesapları kısıtlama hakkına sahiptir.
[*]Hesabınızın güvenliğinden siz sorumlusunuz; şifrenizi kimseyle paylaşmayın.
[/list]

[i]Bu metin yönetim panelinden düzenlenebilir.[/i]`,
  },
  {
    key: 'privacy',
    isRequired: true,
    showOnRegister: true,
    sortOrder: 2,
    title: 'Gizlilik Politikası',
    bodyMd: `[size=5][b]Gizlilik Politikası[/b][/size]

Kayıt sırasında verdiğiniz kullanıcı adı, e-posta adresi ve isteğe bağlı profil bilgileri forum hizmetinin sağlanması için saklanır.

[list]
[*]E-posta adresiniz diğer üyelerle paylaşılmaz.
[*]Güvenlik amacıyla IP adresiniz ve giriş zamanlarınız kaydedilir.
[*]Hesabınızın silinmesini yöneticilerden talep edebilirsiniz.
[/list]

[i]Bu metin yönetim panelinden düzenlenebilir.[/i]`,
  },
  {
    key: 'rules',
    isRequired: true,
    showOnRegister: true,
    sortOrder: 3,
    title: 'Forum Kuralları',
    bodyMd: `[size=5][b]Forum Kuralları[/b][/size]

[list]
[*]Diğer üyelere saygılı olun.
[*]Reklam ve spam yapmayın.
[*]Konuları doğru bölümlerde açın.
[*]Kişisel bilgileri izinsiz paylaşmayın.
[/list]

Kurallara uymayan üyelere uyarı puanı verilebilir; puan eşiklerine göre hesap kısıtlanabilir.`,
  },
];

export const DEFAULT_WARNING_TEMPLATES = [
  { title: 'Kural ihlali', reasonTemplate: 'Forum kurallarına aykırı davranış.', points: 10, expiryDays: 30 },
  { title: 'Spam / reklam', reasonTemplate: 'İzinsiz reklam veya spam içerik paylaşımı.', points: 20, expiryDays: 60 },
  { title: 'Hakaret', reasonTemplate: 'Diğer üyelere karşı hakaret veya saygısız davranış.', points: 30, expiryDays: 90 },
];

export const DEFAULT_WARNING_ACTIONS: Array<{ threshold: number; action: WarningActionType; mode: WarningActionMode; durationDays: number | null }> = [
  { threshold: 10, action: 'watch', mode: 'while_above', durationDays: null },
  { threshold: 30, action: 'moderate', mode: 'while_above', durationDays: null },
  { threshold: 50, action: 'mute', mode: 'while_above', durationDays: null },
  { threshold: 80, action: 'temp_ban', mode: 'timed', durationDays: 7 },
];

export const DEFAULT_ACHIEVEMENT_CATEGORIES = [
  { key: 'community', name: 'Topluluk', description: 'Toplulukla birlikte geçen zaman ve katkılar.' },
  { key: 'profile', name: 'Profil', description: 'Profilini tamamlayan ve hesabını güvenceye alan üyeler için.' },
  { key: 'special', name: 'Özel', description: 'Yönetim tarafından elle verilen özel başarılar.' },
];

export const DEFAULT_ACHIEVEMENTS: Array<{
  key: string;
  category: string;
  name: string;
  description: string;
  tier: number;
  points: number;
  hidden?: boolean;
  criteriaType: string | null;
  criteria?: Record<string, unknown>;
}> = [
  { key: 'welcome', category: 'community', name: 'Hoş Geldin', description: 'E-posta adresini doğruladı ve topluluğa katıldı.', tier: 1, points: 5, criteriaType: 'email_verified' },
  { key: 'one-month', category: 'community', name: 'Bir Aylık', description: '30 gündür topluluğun bir parçası.', tier: 1, points: 10, criteriaType: 'membership_days', criteria: { days: 30 } },
  { key: 'one-year', category: 'community', name: 'Bir Yıllık', description: '1 yıldır topluluğun bir parçası.', tier: 3, points: 50, criteriaType: 'membership_days', criteria: { days: 365 } },
  { key: 'hundred-posts', category: 'community', name: 'Yüz Mesaj', description: '100 mesaj yazdı.', tier: 2, points: 25, criteriaType: 'post_count', criteria: { count: 100 } },
  { key: 'show-your-face', category: 'profile', name: 'Yüzünü Göster', description: 'Profil fotoğrafı yükledi.', tier: 1, points: 5, criteriaType: 'avatar_set' },
  { key: 'all-about-me', category: 'profile', name: 'Kendini Tanıt', description: 'Profilini eksiksiz doldurdu.', tier: 1, points: 10, criteriaType: 'profile_completed' },
  { key: 'security-minded', category: 'profile', name: 'Güvenlik Bilinci', description: 'İki adımlı doğrulamayı etkinleştirdi.', tier: 2, points: 15, criteriaType: 'two_factor_enabled' },
  { key: 'founder', category: 'special', name: 'Kurucu', description: 'Forumun ilk üyelerinden.', tier: 5, points: 100, hidden: false, criteriaType: null },
];

export const DEFAULT_PERMISSION_PROFILES = [
  { key: 'default', name: 'Varsayılan', description: 'Herkes okuyabilir, üyeler konu açıp yanıt yazabilir.' },
  { key: 'read_only', name: 'Salt okunur', description: 'Herkes okuyabilir; yalnızca yönetim ve moderatörler yazabilir (Duyurular gibi).' },
  { key: 'members_only', name: 'Yalnızca üyeler', description: 'Misafirler bölümü göremez; üyeler normal şekilde katılabilir.' },
] as const;

const WRITE_KEYS = new Set(['topic.create', 'post.reply', 'post.images', 'topic.poll']);

type Defaults = Partial<Record<'guest' | 'member' | 'global_moderator' | 'moderator', 1 | -1>>;

export function boardProfileDefaults(profileKey: string, permKey: string, defaults: Defaults): Defaults {
  const d: Defaults = { ...defaults };
  if (profileKey === 'read_only' && WRITE_KEYS.has(permKey)) {
    delete d.guest;
    delete d.member;
    d.global_moderator = 1;
    d.moderator = 1;
  }
  if (profileKey === 'members_only') delete d.guest;
  return d;
}

export interface DefaultBoard {
  name: string;
  description: string;
  icon: string;
  color: string | null;
  profile?: 'read_only' | 'members_only';
  redirectUrl?: string;
}

export const DEFAULT_FORUM: Array<{ name: string; description: string; boards: DefaultBoard[] }> = [
  {
    name: 'Genel',
    description: 'Forum hakkında duyurular ve genel konular.',
    boards: [
      { name: 'Duyurular', description: 'Yönetimden haberler ve güncellemeler.', icon: 'megaphone', color: null, profile: 'read_only' },
      { name: 'Genel Sohbet', description: 'Her konuda sohbet alanı.', icon: 'chats-circle', color: null },
      { name: 'Yardım ve Destek', description: 'Forumla ilgili sorularınızı buraya yazın.', icon: 'lifebuoy', color: null },
    ],
  },
  {
    name: 'Topluluk',
    description: 'Topluluğun buluşma noktası.',
    boards: [
      { name: 'Tanışma', description: 'Kendinizi tanıtın, yeni üyelerle tanışın.', icon: 'hand-waving', color: null },
      { name: 'Konu Dışı', description: 'Oyunlar, filmler, müzik ve daha fazlası.', icon: 'coffee', color: null },
      { name: 'Forum Kuralları', description: 'Katılmadan önce okuyun.', icon: 'book-open-text', color: null, redirectUrl: '/policies/rules' },
    ],
  },
];

export const WELCOME_TOPIC = {
  title: 'Foruma hoş geldiniz!',
  body: `[center][size=5][b]Hoş geldiniz![/b][/size][/center]

Bu forum kurulumla birlikte gelen örnek içerikle açıldı. Bölümleri, kategorileri ve yetkileri [b]Yönetim Paneli → Forum[/b] ekranından düzenleyebilirsiniz.

[list]
[*]Bölümlere özel ikon ve renk seçebilirsiniz.
[*]Her bölüme ayrı bir yetki profili atayabilirsiniz (ör. Duyurular salt okunurdur).
[*]Mesajlar görsel editörle ya da doğrudan BBCode ile yazılabilir.
[/list]

[quote author=Forum]İyi forumlar![/quote]`,
};
