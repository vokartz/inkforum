# Değişiklik günlüğü

[English](CHANGELOG.md) · **Türkçe**

InkForum'daki önemli değişiklikler bu dosyada tutulur. Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/),
sürüm numaraları [Anlamsal Sürümleme](https://semver.org/lang/tr/) kurallarına uyar.
Her sürüm bölümü, CHANGELOG.md'deki İngilizce karşılığıyla birlikte GitHub sürüm notuna ve yönetim panelindeki
güncelleme notuna dönüşür (panel yöneticinin diline uygun olanı gösterir).

## [Yayımlanmamış]

## [1.6.0] - 2026-10-03

### Eklendi

- **Eklenti sistemi.** Eklentiler *Yönetim → Eklentiler* ekranından `.zip` / `.tgz` yükleyerek, npm paket adıyla ya
  da `storage/extensions/<id>` klasörüne kopyalanarak kurulur. Kurmadan önce yönetici eklentinin ne yapacağını
  görür (sunucu kodu, her sayfada betik, dış adresler, yetkiler, menü bağlantıları). Bir eklenti şunları ekleyebilir:
  - kendi adreslerinde forum sayfaları ve **forum sayfalarının yerine geçen** sayfalar (`override: true` — ana sayfa,
    üyeler, profiller …; yönetim, giriş ve API adresleri korunur),
  - yönetim sayfaları (yönetim menüsünde *Eklentiler* altında) ve otomatik ayar formu, üye ayarları sayfaları
    (*Ayarlar → Eklentiler*),
  - `/api/ext/<id>/…` altında giriş, yetki, yönetim ve hız sınırı seçenekli API uçları,
  - migration'larla kendi veritabanı tabloları (SQLite ve PostgreSQL), anahtar-değer deposu ve başka herhangi bir
    veritabanına ya da servise bağlantı (tam Node.js),
  - sayfa yerlerine HTML: üst çubuğun altı, alt bilginin üstü, ana sayfanın üstü / yan sütunu, bölümün üstü, konunun
    üstü / altı, her mesajın altı, **her mesajın düğmeleri** (ör. şikayet sistemi), profil kartları ve sekmeleri,
  - menü bağlantıları, yetkiler (*Yönetim → Yetkiler* ekranında), olay dinleyicileri, kuyruk işleri ve zamanlanmış
    görevler, her sayfada betik ve stil.
  Eklentiler açılıp kapatılabilir, yeniden yüklenebilir, yerinde güncellenebilir (ayarlar ve veriler korunur, yeni
  migration'lar çalışır) ve verileriyle ya da verileri korunarak kaldırılabilir. Her eklentinin sunucu kayıtları
  yönetim panelinde görünür. `INKFORUM_SAFE_MODE=1` (ya da `storage/extensions/.safemode` dosyası) forumu eklentisiz
  başlatır.
- Eklenti geliştiricileri için **başlangıç paketi**, *Yönetim → Eklentiler → Eklenti geliştir* ekranından indirilir
  (npm gerekmez): çalışan bir örnek eklenti, editör için tür tanımları ve `inkforum-ext` aracı (`validate`, `pack`,
  `build`). Ayrıntılı geliştirici rehberi de aynı ekranda.
- InkForum ile gelen **hazır eklentiler**: *Oyun Paneli* (karakter başvurusu) ve *Şikayet Merkezi* (her mesajda
  "Şikayet et" düğmesi, üyenin şikayetleri, iç notlu ekip kuyruğu, atama ve durum takibi). Tek tıkla kurulur ya da
  temel almak için indirilir.
- **Yönetim rehberi:** yönetim paneline ilk girişte karşılama ekranı ve menüyü adım adım gösteren tanıtım turu;
  güncellemeden sonra değişiklikleri anlatan "Neler yeni?" penceresi. İkisi de yardım düğmesinden yeniden açılabilir.

### Değişti

- **Sadeleşen yönetim menüsü:** benzer sayfalar sekmelerde birleşti (Captcha Güvenlik altında, Tepkiler Emojilerle,
  İşler ve Sistem bilgisi Bakım altında), Politikalar Forum grubuna taşındı, üyeler ve gruplar tek grupta, eklentilerin
  kendi grubu var. Gömülü içerik sayfası menüden gizlendi; gömülü içerik kayıtlı ayarlarıyla çalışmaya devam eder.
- **Tema stüdyosu** tam ekran açılır ve önizlemeyi gerçek ekran genişliğinde (1920 / 1440 / tablet / telefon) çizip
  alana sığdırır; sayfa genişliği, yan sütun ve yoğunluk seçenekleri önizlemede görünür. Genişlik seçenekleri piksel
  karşılığını gösterir, mesaj düzeni için önizlemede bir konu açılabilir.

### Kaldırıldı

- *Özel kod ve entegrasyon* ekranı (HTML/CSS/JS parçacıkları, özel CSS, dış kaynak izin listesi ve UCP için imzalı
  üye belirteci, `window.forum.token()`). Yerini eklentiler aldı. Özel kod yetkisinin adı artık "Kod düzenleme";
  sayfa, tema, ana sayfa bloğu ve bakım sayfasındaki HTML/CSS/JS'i denetlemeye devam eder.

### Düzeltildi

- Profil kapak fotoğrafının konumunu kaydetmek işe yaramıyordu.
- Sunucuda özel sayfa çizen sayfalar (ör. açılış sayfası) iç hata verebiliyordu.

## [1.5.0] - 2026-10-02

### Eklenenler

- **Sayfa sunucu kodunda forum verisi:** özel sayfaların sunucu kodu forum verisini ziyaretçinin yetkileriyle okuyabilir:
  `forum.site`, `forum.stats()`, `forum.online()`, `forum.user(kimlik ya da ad)`, `forum.members()`, `forum.groups()`,
  `forum.groupMembers()`, `forum.boards()`, `forum.topics()`, `forum.topic()`, `forum.userTopics()` ve `forum.search()`.
  `req.user` artık ziyaretçinin kendi e-postasını, grup adlarını, yetkilerini, mesaj sayısını, itibarını, başarı ve
  uyarı puanını içerir; `fetch` ile kendi sisteminize gönderilebilir. Başka üyelerin e-posta ve IP adresleri hiçbir
  zaman verilmez. *Yönetim → Sayfalar → Belgeler*'de anlatıldı, iki yeni hazır örnek eklendi.

### Düzeltilenler

- Özel sayfa belgeleri geniş tablo ve kod örneklerinde sağa taşıyordu.

## [1.4.1] - 2026-10-02

### Değişenler

- **Yeni özel mesaj sayfası** konu açma ekranıyla aynı düzende: alıcılar, başlık ve mesaj alanları "Gerekli" etiketi
  ve karakter sayacıyla, altta sabit gönder çubuğu, yanda katılımcılar ve ipuçları.
- **Forumun kendi onay pencereleri:** kaydedilmemiş değişiklikle sayfadan ayrılırken (ayarlar, tema stüdyosu, sayfalar,
  wiki, e-posta şablonları) tarayıcının kutusu yerine forumun penceresi çıkar. Başvuru ve grup isteği reddetme ile uyarı
  geri alma gerekçeleri de aynı pencerede yazılır.
- **Yazdırma** her sayfada, tema ne olursa olsun sade ve açık renkli: menü, alt bilgi, düğmeler ve yanıt kutusu basılmaz;
  üstte forum adı ve sayfa adresi, bağlantıların yanında adresleri yer alır.
- **Politika sayfaları:** politika yönetme yetkisi olan herkese yazılı *Düzenle* ve *Yazdır* düğmeleri görünür; basılı
  kopyada sürüm ve yazdırma tarihi yer alır.

## [1.4.0] - 2026-10-02

### Eklenenler

- **XenForo 2'den taşıma:** üyeler eski şifreleriyle giriş yapar; gruplar, unvan merdiveni, görüntüleme izinleriyle
  bölümler, konular, mesajlar (alıntı, bahsetme, medya, spoiler, ekler), anketler, özel yazışmalar ve yasaklar aktarılır.
  Eski `/threads/…`, `/posts/…`, `/forums/…` ve `/members/…` bağlantıları yeni sayfalara yönlenir.
- **cPanel'e kurulum:** sunucu paketi cPanel *Setup Node.js App* (Passenger) ve Plesk'te `app.cjs` başlangıç dosyasıyla,
  SSH gerekmeden çalışır. Zamanlanmış görevler `node app.cjs cron` ile çalışır. Adım adım rehber README'de.

### Değişenler

- Bildirimler güne göre gruplanır; her türün ikonu var, okunmamışlar belirgin.
- Çevrimiçi sayfası üye ve misafir sayılarını, her üyenin son görülme zamanını gösterir.
- Konu düğmeleri telefonda sığar, mesaj yazarının istatistikleri ayrı satıra geçer.
- Kapak resmi olmayan profillerde başlık alanı daha kısa.

### Düzeltilenler

- Grup üye sayıları kayıt ve rütbe değişikliklerinden sonra 0'da kalıyordu.
- Geçişli sayfa arka planları uzun sayfalarda ekranın altında bitiyordu.

## [1.3.0] - 2026-10-01

### Eklenenler

- **Kodla özel sayfalar (Yönetim → Sayfalar):** sayfayı HTML, CSS ve JavaScript ile yazın; isteğe bağlı kenar
  çubuğu ekleyin (forumun kenar çubuğu, kendi HTML'iniz ya da hiç). Sayfa istediğiniz kök adreste yayınlanabilir,
  örneğin `/ucp`, ve kendi sunucu kodu olabilir: yalıtılmış bir `handle(req)` fonksiyonu yönlendirme yapabilir,
  sayfaya veri verebilir ya da `/api/page-api/<sayfa>/…` adresindeki JSON isteklerini yanıtlayabilir. Sunucu kodu
  izin verilen dış adreslere `fetch` ile istek atabilir, sayfaya özel anahtar-değer deposu kullanabilir, tarayıcıya
  hiç gitmeyen şifreli gizli değerleri okuyabilir ve giriş yapmış üye için imzalı bir anahtar alabilir. İşlemci,
  süre ve bellek sınırlarıyla çalışır. Test aracı, hazır örnekler (UCP tek oturum, üye paneli, form, tanıtım sayfası,
  kenar çubuğu), ayrıntılı bir belge sayfası, arayüz kiti (`f-*` sınıfları) ve `<forum-user>`, `<forum-recent>`,
  `<forum-countdown>` gibi forum bileşenleri de eklendi.
- **Bakım sayfası tasarımcısı:** düzen, ikon, arka plan, metinler, geri sayım, ilerleme çubuğu, düğmeler, sosyal
  bağlantılar ve yetkili girişi bağlantısı; özel kod yetkisi olan yöneticiler kendi HTML ve CSS'lerini ekleyebilir.
- **İsteğe bağlı captcha:** kayıt, giriş ve şifremi unuttum formlarında yerleşik matematik sorusu, Cloudflare
  Turnstile, hCaptcha ya da Google reCAPTCHA; her form için ayrı seçilir.
- **Paylaşım kartı tasarımcısı (Yönetim → Paylaşım kartı):** bağlantı önizleme görselini dört düzen, renk, geçiş ya
  da görsel arka plan, logo, metinler ve gömme rengiyle tasarlayın; Discord benzeri canlı önizleme ile.
- **Destek taleplerinde otomatik yetkili atama:** her kategori yeni talepleri yetkililere sırayla, açık talebi en az
  olana ya da hep aynı kişiye verebilir; istenirse çevrimiçi yetkililer önceliklidir. Bildirim yalnızca atanan
  yetkiliye gider.

### Değişenler

- **Özel mesajlar konu gibi çalışıyor:** her yazışmanın bir başlığı var, mesajlar sohbet balonu yerine yazar kartı,
  alıntı ve tam editörle birer gönderi olarak görünür.
- Destek talepleri ve başvurular sayfaları sadeleştirildi.
- YouTube ve diğer gömülü içerikler editörde doğrudan oynatılır, özel emojiler yazarken görsel olarak görünür.
- Güncellemeler sayfası ve diğer yönetim sayfaları, güncelleyiciye ulaşılamadığında bile hızlı açılır.

### Kaldırılanlar

- Görsel sayfa oluşturucu. Mevcut oluşturucu sayfaları çalışmaya devam eder; editörde açıldığında HTML'e çevrilir.
- Sohbet kutusu ve oyun sunucusu durumu eklentileri.

### Düzeltilenler

- Açık ve koyu mod arasında geçiş artık sayfayı yenilemeden hemen uygulanır.

## [1.2.0] - 2026-10-01

### Eklenenler

- **Tema stüdyosu (Yönetim → Temalar):** kod yazmadan, görsel olarak baştan sona yeni bir tema yapın. Hazır bir
  başlangıçtan (Modern, Topluluk, Gece Mavisi, Orman, Gün Batımı, Kâğıt, Neon, Temiz Açık) ya da var olan bir temanın
  kopyasından başlayıp açık ve koyu renkleri, yazı tiplerini ve boyutları, köşeleri, kenarlık ve gölgeleri, kart
  stilini, üst alan düzenini (üst çubuk, banner, ortalı), menü stilini, sayfa genişliğini, yan sütunun yerini,
  sıklığı, mesaj düzenini, forum listesini, sayfa arka planını (geçiş, desen, görsel) ve efektleri değiştirin. Canlı
  önizleme ana sayfayı, bir bölümü ya da konuyu masaüstü, tablet ve telefonda, açık ve koyu modda gösterir. Her temanın
  kendi ayarları vardır; temalar kopyalanabilir, JSON olarak dışa/içe aktarılabilir, varsayılana döndürülebilir ve
  etkinleştirilebilir. Özel kod iznine sahip yöneticiler temaya CSS, üst alan ve alt bilginin önüne/arkasına HTML
  ekleyebilir.
- **Eklentiler:** Sohbet kutusu (ana sayfada canlı sohbet), Discord (sunucu widget'ı ve webhook ile yeni konu
  bildirimleri) ve Oyun sunucusu durumu (FiveM, Minecraft ve SA-MP, oyuncu sayılarıyla). Varsayılan olarak kapalıdır;
  açılınca bloğu ana sayfaya eklenir.
- **Anlık bildirimler ve mesajlar:** bildirimler, yeni mesajlar ve okundu bilgisi sayfa yenilenmeden anında gelir;
  isteğe bağlı ses ve sekme başlığında okunmamış sayısı. Mesajlar sayfası iki sütunlu yeni bir mesajlaşma düzenine
  kavuştu.
- **Giriş ve kayıt sayfası düzenleri:** görselli bölünmüş, ortalı ya da tam sayfa kapak; kendi başlığınız ve
  metninizle. Görsel olmayan sayfalar artık eksik görünmüyor.

### Değişenler

- **Forum listesi yenilendi:** konu ve mesaj sayıları, yazarının avatarıyla son mesaj ve etiket olarak alt bölümlerle
  daha sade bölüm satırları. Temalar listeyi tablo, kart ya da sıkışık liste olarak gösterebilir.
- Temalar: SMF teması kaldırıldı, IPS tarzı temanın adı artık **Topluluk**. Mevcut forumların görünümü değişmez;
  Modern ve Topluluk tema stüdyosunda sistem temasıdır. Tema seçenekleri (vurgu, mod, yazı tipi, köşeler, mesaj
  düzeni) Görünüm sayfasından tema stüdyosuna taşındı.
- Görseli olmayan profil kapağı artık düz renk.
- Bölümlerin bağlantı önizlemeleri (Open Graph) kategoriyi ve sayıları gösterir; Coolify'ın ürettiği adres yerine
  forumun kendi alan adını kullanır.

### Düzeltilenler

- Yönetim → Görünüm kaydedilmiyordu (banner renginde doğrulama hatası).
- Konu şablonu hatalı bir bölümü kaydetmek hiçbir şey olmamış gibi görünüyordu; hata artık alanın yanında ve mesaj
  olarak gösteriliyor.

## [1.1.1] - 2026-10-01

### Eklenenler

- **Coolify'da güncelleme:** Coolify'a tek imaj olarak eklenen forumlar artık tek tıkla güncellenebilir — kaynağın Deploy
  Webhook adresini ve API anahtarını Yönetim → Güncellemeler → Coolify ile güncelleme bölümüne girin.
- **SQLite → PostgreSQL taşıma:** `node cli.mjs transfer-db postgres://…` tüm tabloları boş bir PostgreSQL veritabanına
  kopyalar, satır sayılarını doğrular ve kaynağı hiç değiştirmez.
- Açılışta yeni migration'lar uygulanmadan önce otomatik veritabanı yedeği (`pre-migrate`) alınır.

### Düzeltilenler

- **Coolify'da her yeniden dağıtımda forumun silinmesi:** `/app/storage` klasörüne kalıcı disk bağlı değilken (Coolify'da
  yalnızca imaj) her yeniden dağıtım boş bir diskle başlıyor ve kurulum sayfası yeniden açılıyordu. Kurulum sihirbazı,
  yönetim paneli ve Yönetim → Sistem artık bunu algılıyor; Persistent Storage eklemeyi ve mevcut verileri korumayı
  adım adım gösteriyor. Disk kalıcı olana dek Coolify ile güncelleme engellenir; Docker güncelleyicisi kapsayıcıyı
  yeniden oluştururken bu birimleri korur.
- Güncelleyici kapsayıcısı yokken güncelleme yalnızca "fetch failed" hatasıyla duruyordu; Güncellemeler sayfası artık
  nedenini (bulunamadı / çalışmıyor / yanıt yok) ve çözümünü gösteriyor.
- Yönetim → E-posta sayfası e-postaların gönderilmediği durumu (Günlük modu, SMTP ayarlı değil) açıkça bildiriyor;
  "Bana örnek gönder" bu modda artık başarılı demiyor.
- E-postalar: logo beyaz zeminde görünüyor, açık vurgu renklerinde düğme yazısı okunaklı; önizleme bağlantıları forumun
  kendi adresini kullanıyor.

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
