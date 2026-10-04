import { z } from 'zod';
import { compareVersions } from './updates.js';

export interface AdminOnboarding {
  tourDoneAt: number | null;
  seenVersion: string | null;
  currentVersion: string;
}

export const onboardingInput = z.object({
  tour: z.enum(['done', 'reset']).optional(),
  seenVersion: z.string().max(40).optional(),
});
export type OnboardingInput = z.output<typeof onboardingInput>;

export interface TourStep {
  target: string | null;
  title: string;
  body: string;
  href?: string;
  icon?: string;
}

export const ADMIN_TOUR: TourStep[] = [
  {
    target: 'nav',
    title: 'Yönetim menüsü',
    body: 'Forumun her ayarı bu menüde, konulara göre gruplanmış durumda: Görünüm, Forum, Üyeler ve gruplar, Moderasyon, Eklentiler ve Sistem. Grup başlığına tıklayarak daraltabilir, üstteki kutudan menüde arama yapabilirsin.',
  },
  {
    target: 'palette',
    title: 'Hızlı erişim',
    body: 'Ctrl + K (Mac: ⌘ + K) ile istediğin sayfaya ya da ayara yazarak anında git. "logo", "kayıt", "yedek" gibi bir kelime yazman yeter.',
  },
  {
    target: 'group-Görünüm',
    title: 'Forumunun görünümü',
    body: 'Temalar ekranında hazır temalardan birini seç ya da tema stüdyosunda renk, yazı tipi ve düzeni canlı önizleyerek kendi temanı yap. Logo, menü ve alt bilgi Görünüm sayfasında; ana sayfadaki kutular Ana sayfa düzeninde.',
  },
  {
    target: 'group-Forum',
    title: 'Bölümler ve kategoriler',
    body: 'Forumun iskeleti burada: kategoriler, bölümler, konu önekleri, etiketler ve emojiler. Bölümleri sürükleyip sıralayabilir, her bölüme ayrı yetki profili verebilirsin.',
  },
  {
    target: 'group-Üyeler ve gruplar',
    title: 'Üyeler, gruplar ve yetkiler',
    body: 'Üyeleri ara, onayla, yasakla. Gruplar (rütbeler) ve yetkiler SMF mantığıyla çalışır: bir yetkiyi gruba verir ya da yasaklarsın; yasak her zaman kazanır.',
  },
  {
    target: 'nav-extensions',
    title: 'Eklentiler',
    body: 'Wiki, başvurular, destek talepleri gibi yerleşik eklentileri buradan açıp kapatırsın. .zip ya da npm paketi olarak eklenti yükleyerek foruma yeni sayfalar, yönetim ekranları, oyun sunucusu paneli (UCP) gibi her şeyi ekleyebilirsin.',
  },
  {
    target: 'group-Sistem',
    title: 'Sistem, güvenlik ve güncellemeler',
    body: 'Güncellemeler tek tıkla kurulur ve geri alınabilir. Bakım ekranından yedek al, güvenlik ekranından güvenlik duvarını ve bot doğrulamayı (captcha) yönet, e-posta gönderimini ayarla.',
  },
  {
    target: 'version',
    title: 'Sürüm ve yenilikler',
    body: 'Yeni bir InkForum sürümü çıktığında burada görünür. Güncelledikten sonra panele ilk girişinde neyin değiştiğini anlatan "Yenilikler" penceresi açılır.',
  },
  {
    target: 'todo',
    href: '/admin',
    title: 'Pano',
    body: 'Onay bekleyen üyeler, bekleyen mesajlar ve başarısız işler burada listelenir. Panoyu her gün bir göz atman yeterli.',
  },
  {
    target: 'help',
    title: 'Turu yeniden başlat',
    body: 'Bu turu ve yenilikleri istediğin zaman sağ üstteki yardım düğmesinden yeniden açabilirsin. Hazırsın — iyi forumlar!',
  },
];

export interface WhatsNewItem {
  icon: string;
  title: string;
  body: string;
  href?: string;
}

export interface WhatsNewEntry {
  version: string;
  title: string;
  items: WhatsNewItem[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '1.6.1',
    title: 'Yeni gruplar sayfası',
    items: [
      {
        icon: 'users-three',
        title: 'Roller ve üyeleri tek sayfada',
        body: 'Gruplar sayfası yeniden tasarlandı: her rol üyeleriyle birlikte aynı sayfada görünüyor, ayrı üye sayfası yok. Hangi grupların hangi sırayla görüneceğini, üyelerin gösterilip gösterilmeyeceğini ya da sayfanın tamamen kapatılmasını Gruplar → Gruplar sayfası ekranından ayarlayın.',
        href: '/admin/groups-page',
      },
    ],
  },
  {
    version: '1.6.0',
    title: 'Yepyeni eklenti sistemi',
    items: [
      {
        icon: 'puzzle-piece',
        title: 'Eklenti yükle: .zip, .tgz ya da npm',
        body: 'Eklentiler artık foruma yeni sayfalar, yönetim ve üye ayarları ekranları, API uçları, veritabanı tabloları ve menü bağlantıları ekleyebilir; ana sayfa ve profil gibi forum sayfalarının yerine geçebilir, konu ve mesajların altına düğme ekleyebilir (ör. şikayet sistemi), başka bir veritabanına bağlanıp oyun sunucunuzun UCP\'sini foruma taşıyabilir.',
        href: '/admin/extensions',
      },
      {
        icon: 'code',
        title: 'Kendi eklentini yaz',
        body: 'Eklenti geliştir ekranından başlangıç paketini indir: çalışan bir örnek eklenti, editör için türler ve paketleme aracı içinde, npm gerekmez. Oyun Paneli ve Şikayet Merkezi hazır eklenti olarak tek tıkla kurulur.',
        href: '/admin/extensions/docs',
      },
      {
        icon: 'squares-four',
        title: 'Sadeleşen yönetim menüsü',
        body: 'Benzer sayfalar birleşti: Captcha artık Güvenlik altında, Tepkiler Emojilerle birlikte, İşler ve Sistem bilgisi Bakım altında. "Özel kod ve entegrasyon" ekranı kaldırıldı; aynı işleri eklentiler yapıyor.',
      },
      {
        icon: 'paint-brush-broad',
        title: 'Tema stüdyosu tam ekran',
        body: 'Önizleme artık gerçek ekran genişliğinde çiziliyor: Dar / Normal / Geniş sayfa genişliği ve yan sütun farkı önizlemede birebir görünüyor. Profil kapak fotoğrafının konumu da artık doğru kaydediliyor.',
        href: '/admin/themes',
      },
    ],
  },
];

export function whatsNewSince(seen: string | null, current: string): WhatsNewEntry[] {
  return WHATS_NEW.filter((e) => compareVersions(e.version, current) <= 0 && (!seen || compareVersions(e.version, seen) > 0));
}
