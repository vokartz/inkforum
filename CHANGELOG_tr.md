# Değişiklik günlüğü

[English](CHANGELOG.md) · **Türkçe**

InkForum'daki önemli değişiklikler bu dosyada tutulur. Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/),
sürüm numaraları [Anlamsal Sürümleme](https://semver.org/lang/tr/) kurallarına uyar.
Her sürüm bölümü, CHANGELOG.md'deki İngilizce karşılığıyla birlikte GitHub sürüm notuna ve yönetim panelindeki
güncelleme notuna dönüşür (panel yöneticinin diline uygun olanı gösterir).

## [Yayımlanmamış]

## [1.1.0] - 2026-10-01

### Eklenenler

- **Konu şablonları:** her bölüm, konu açılırken sorular sorabilir (kısa/uzun yanıt, sayı, bağlantı, açılır liste,
  tek ve çoklu seçim, zorunlu alanlar). Konu mesajı yanıtlardan oluşur, başlık otomatik üretilebilir
  (ör. `{user} — Yetkili başvurusu`).
- **Onay kuyruğu** (`/mod/queue`): onay bekleyen konu ve yanıtlar tek yerde; onayla / reddet düğmeleri ve
  moderatörler için kullanıcı menüsünde sayaç.
- **Gizli konular:** moderatörler bir konuyu yalnızca yazarının ve yetkililerin göreceği şekilde gizleyebilir;
  bölümler "konular gizli" olarak ayarlanabilir (başvuru, şikâyet, destek). Yetkililer gizli konuya başka üyeleri
  ekleyebilir; eklenen üye konuyu görür, yanıtlayabilir, takibe alınır ve bildirim alır.
- **Her sayfa için paylaşım kartı:** bölümler, profiller, wiki ve özel sayfalar, etiketler ve sabit sayfalar Discord,
  X, WhatsApp vb. için kendi önizleme görselini alır; `og:image` boyutu, doğru `og:locale` ve vurgu rengi (gömme
  kartı kenarı) eklenir.

### Düzeltilenler

- Docker kurulumlarında paylaşım görsellerinde yazılar kutucuk olarak çıkıyordu (imajda font yoktu); fontlar artık
  uygulamayla geliyor.
- Gizli konulardaki bahsetme, alıntı ve yanıt bildirimleri yalnızca konuyu görebilen üyelere gider.
- Diğer dillerde Türkçe metin görünmesi giderildi: alt bilgi bağlantıları, alıntı başlığı ("… yazdı:"), yedek
  etiketleri, bildirim ayarları, grup adları, destek kategorileri, wiki açıklaması, eklenti durumları, yetki profilleri,
  tepkiler, başarılar, politikalar, yönetim kenar çubuğu ve e-posta şablonları ziyaretçinin dilini izliyor.
- Kurulum dilinde oluşturulan örnek içerik (bölümler, kategoriler) her ziyaretçiye kendi dilinde gösterilir.
- Var olan mesaj, özel mesaj ve sayfalardaki alıntılar otomatik güncellenir; başlıkları okuyanın dilinde görünür.
- `ADMIN_PASSWORD` ile otomatik kurulan forumlarda örnek içerik varsayılan dilde oluşturulur.
- Açık vurgu renklerinde (ör. varsayılan gri) düğme yazıları artık koyu ve okunaklı.
- Mesajlar sayfası: hiç konuşma yokken tek ve net bir başlangıç ekranı; büyük ekranlarda daha dengeli yükseklik.
- Profil sayfası: işlemler adın yanına taşındı; ikincil işlemler kapak fotoğrafını kaplamak yerine "⋯" menüsünde.
- Çerezler sayfası yeniden tasarlandı (özet, düzenli tablo, sabit "çerezleri temizle" kartı).
- Bazı kartların üstündeki fazladan boşluk kaldırıldı.

### Değişenler

- Almanca çeviri tamamlandı ve düzeltildi (yaklaşık 1.400 metin Türkçe ya da İngilizce kalmıştı); Fransızca, Rusça,
  Portekizce, İspanyolca ve Çince tamamlandı. Eksik kalan bir metin olursa Türkçe yerine İngilizce gösterilir.

## [1.0.1] - 2026-10-01

### Değişenler

- Kurulum sihirbazı artık kurulum kodu istemiyor; doğrudan sistem denetimiyle açılıyor.
- Hiçbir ortam değişkeni zorunlu değil: `APP_URL` verilmezse site adresi platformdan (Coolify) alınır ya da kurulum
  sihirbazında tarayıcıdan algılanıp kaydedilir; `APP_SECRET` ve `UPDATER_TOKEN` üretilip `storage` biriminde saklanır.
- Kurulum betiği (`install.sh`) sistem dilini algılar (8 dil) ve forumun ilk dilini ayarlar.
- Docker imajı özel ağlardaki ters vekillere varsayılan olarak güvenir (`TRUST_PROXY=uniquelocal`).

### Düzeltilenler

- `APP_URL` gerçek adresle uyuşmadığında (ör. Coolify'da) kurulum "İstek kaynağı doğrulanamadı" hatasıyla duruyordu.

## [1.0.0] - 2026-10-01

İlk kararlı sürüm.

### Forum

- Kategoriler, iç içe bölümler, konu önekleri, etiketler, anketler, tepkiler, alıntı ve bahsetme
- Zengin metin düzenleyici (BBCode tabanlı), başlıklar, tablolar, gömülü medya
- Okunmamış konular, takip, bildirimler ve e-posta bildirimleri
- Özel mesajlar, profiller, rütbeler, başarılar, uyarı puanları ve yasaklar

### Tasarım

- Üç tema: Modern, Topluluk ve Klasik (SMF tarzı) — hepsi açık/koyu mod ve mobil uyumlu
- Vurgu rengi, yazı tipi, köşe yuvarlaklığı, banner, logo ve arka plan yönetimden ayarlanır
- Sürükle-bırak sayfa oluşturucu (Stüdyo): ayrı site gibi açılış sayfaları, galeri, sayaç, fiyat tablosu ve daha fazlası
- Görünümü varsayılana sıfırlama

### Eklentiler

- Açılış sayfası, Wiki (iç içe sayfalar, geçmiş), Başvurular (özel sorular ve gereksinimler), Destek talepleri

### Güvenlik

- Yerleşik güvenlik duvarı (WAF): saldırı kalıbı engelleme, hız sınırı, kötü bot engeli, doğrulama sayfası (yerleşik, Turnstile, hCaptcha)
- İki adımlı doğrulama, yönetimde yeniden doğrulama, API anahtarları ve OAuth izin kapsamları

### Kurulum ve bakım

- Docker ile tek komutla kurulum ve kurulum sihirbazı
- Yönetim panelinden tek tıkla güncelleme, otomatik güncelleme denetimi ve sürüm notları
- Günlük otomatik yedek (veritabanı, SQL dökümü ya da dosyalarla birlikte tam yedek), yedek yükleme ve tek tıkla geri yükleme
- Sistem durumu, bakım araçları ve GitHub'a hazır bilgilerle hata bildirimi

### Taşıma ve dil

- SMF, phpBB, Invision Community ve MyBB'den içe aktarma: üyeler (eski şifreleriyle giriş), gruplar ve rütbe görselleri, bölüm erişimleri, konular, mesajlar, anketler, özel mesajlar, ekler ve eski bağlantıların yönlendirilmesi
- Türkçe ve İngilizce arayüz; tarayıcı diline göre otomatik seçim ve üye başına dil tercihi
