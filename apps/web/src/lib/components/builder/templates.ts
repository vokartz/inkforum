import { builderBlockSchema, newBlockId, type BuilderBlock } from '@forum/shared';

/** Hazır sayfa şablonları (boş sayfada seçilir; sonra her şey düzenlenebilir). */
export interface BuilderTemplate {
  key: string;
  label: string;
  description: string;
  blocks: () => BuilderBlock[];
}

const make = (list: Array<Record<string, unknown>>): BuilderBlock[] => list.map((b) => builderBlockSchema.parse({ id: newBlockId(), ...b }));

export const BUILDER_TEMPLATES: BuilderTemplate[] = [
  {
    key: 'server',
    label: 'Oyun sunucusu tanıtımı',
    description: 'Kapak, sunucu kartı, özellikler, istatistikler, son konular ve sık sorulanlar.',
    blocks: () =>
      make([
        { type: 'navbar', width: 'full', spacing: 'none', animation: 'none', transparent: true, links: [{ label: 'Sunucu', url: '#sunucu' }, { label: 'Forum', url: '/forum' }, { label: 'Wiki', url: '/wiki' }] },
        {
          type: 'hero',
          width: 'full',
          height: 'screen',
          align: 'center',
          showLogo: true,
          eyebrow: 'Yeni sezon başladı',
          title: 'Hikâyeni yazmaya hazır mısın?',
          text: 'Gerçekçi rol yapma, aktif bir topluluk ve her gün yeni maceralar. Hemen katıl, karakterini oluştur.',
          buttons: [
            { label: 'Hemen başla', url: '/register', style: 'primary' },
            { label: 'Forumu gez', url: '/forum', style: 'outline' },
          ],
        },
        { type: 'server', anchor: 'sunucu', name: 'Sunucumuz', description: 'Sunucunuzu birkaç cümleyle tanıtın: oyun türü, kurallar, öne çıkanlar.', address: 'play.sunucu.com', status: 'online', players: '128 slot', tags: ['Roleplay', 'Türkçe'] },
        {
          type: 'features',
          title: 'Neden bizi seçmelisin?',
          subtitle: 'Topluluğumuzu farklı kılan birkaç şey.',
          align: 'center',
          items: [
            { icon: 'users-three', title: 'Aktif topluluk', text: 'Her gün yüzlerce oyuncu ve etkinlik.' },
            { icon: 'shield-check', title: 'Adil yönetim', text: 'Açık kurallar, hızlı ve tarafsız destek.' },
            { icon: 'lightning', title: 'Performans', text: 'Güçlü sunucular, düşük gecikme.' },
          ],
        },
        { type: 'stats', title: 'Rakamlarla biz', align: 'center', background: 'muted', width: 'full' },
        { type: 'latest', title: 'Forumdan son konular', limit: 6 },
        { type: 'faq', title: 'Sık sorulan sorular', align: 'center', items: [{ q: 'Nasıl başlarım?', a: 'Kayıt olun, kuralları okuyun ve başvuru bölümünden karakterinizi oluşturun.' }, { q: 'Sunucuya nasıl bağlanırım?', a: 'Yukarıdaki sunucu kartından adresi kopyalayın ya da Bağlan düğmesine tıklayın.' }] },
        { type: 'cta', title: 'Aramıza katıl', text: 'Üyelik ücretsiz ve bir dakikadan kısa sürer.', align: 'center', background: 'accent', width: 'full', buttons: [{ label: 'Kayıt ol', url: '/register', style: 'primary' }] },
        { type: 'footer', width: 'full', background: 'card', text: 'Topluluğumuz hakkında kısa bir yazı.', columns: [{ title: 'Topluluk', links: [{ label: 'Forum', url: '/forum' }, { label: 'Üyeler', url: '/members' }] }, { title: 'Yardım', links: [{ label: 'Wiki', url: '/wiki' }, { label: 'Kurallar', url: '/policies/rules' }] }] },
      ]),
  },
  {
    key: 'community',
    label: 'Topluluk ana sayfası',
    description: 'Karşılama, istatistikler, forum bölümleri, son konular ve ekip.',
    blocks: () =>
      make([
        { type: 'navbar', width: 'full', spacing: 'none', animation: 'none', links: [{ label: 'Forum', url: '/forum' }, { label: 'Wiki', url: '/wiki' }, { label: 'Üyeler', url: '/members' }] },
        { type: 'hero', width: 'full', height: 'md', title: 'Topluluğumuza hoş geldin', text: 'Sorular sor, deneyimlerini paylaş, yeni insanlarla tanış.', buttons: [{ label: 'Foruma git', url: '/forum', style: 'primary' }, { label: 'Kayıt ol', url: '/register', style: 'outline' }] },
        { type: 'stats', title: '' },
        { type: 'boards', title: 'Forum bölümleri' },
        { type: 'latest', title: 'Son konular', limit: 6 },
        { type: 'team', title: 'Yönetim ekibi', align: 'center' },
        { type: 'footer', width: 'full', background: 'card', columns: [{ title: 'Topluluk', links: [{ label: 'Forum', url: '/forum' }, { label: 'Wiki', url: '/wiki' }] }] },
      ]),
  },
  {
    key: 'launch',
    label: 'Açılış / yakında sayfası',
    description: 'Tam ekran kapak, geri sayım ve Discord düğmesi.',
    blocks: () =>
      make([
        { type: 'hero', width: 'full', height: 'screen', align: 'center', showLogo: true, eyebrow: 'Çok yakında', title: 'Yeni bir şey geliyor', text: 'Açılışı kaçırmamak için Discord sunucumuza katıl.', buttons: [{ label: "Discord'a katıl", url: 'https://discord.gg/', style: 'primary', newTab: true }] },
        { type: 'countdown', title: 'Açılışa kalan süre', align: 'center', target: Date.now() + 14 * 86_400_000, doneText: 'Açıldık!' },
      ]),
  },
];
