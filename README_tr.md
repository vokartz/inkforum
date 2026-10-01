<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/inkforum-wordmark-light.png">
  <img src=".github/assets/inkforum-wordmark-dark.png" alt="InkForum" width="360">
</picture>

### Modern, hafif ve baştan sona yönetilebilir topluluk yazılımı

Oyun sunucuları, rol yapma toplulukları, markalar ve meraklı gruplar için:
tek komutla kurulur, ucuz bir sunucuda rahatça çalışır, yönetim panelinden tek tıkla güncellenir.

[![Son sürüm](https://img.shields.io/github/v/release/vokartz/inkforum?label=s%C3%BCr%C3%BCm&color=7b61ff)](https://github.com/vokartz/inkforum/releases)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Fvokartz%2Finkforum-2496ed?logo=docker&logoColor=white)](https://github.com/vokartz/inkforum/pkgs/container/inkforum)
[![Platform](https://img.shields.io/badge/platform-amd64%20%7C%20arm64-555)](#gereksinimler)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/vokartz)

[English](README.md) · **Türkçe** · [Deutsch](README_de.md) · [简体中文](README_zh.md) · [Español](README_es.md) · [Français](README_fr.md) · [Русский](README_ru.md) · [Português](README_pt.md)

[Hızlı kurulum](#-hızlı-kurulum) · [Özellikler](#-özellikler) · [Güncellemeler](#-güncellemeler) · [Yedekleme](#-yedekleme-ve-geri-yükleme) · [Taşıma](#-başka-forumdan-taşıma) · [SSS](#-sık-sorulan-sorular) · [Destek ol](#-projeye-destek-olun)

</div>

---

## Neden InkForum?

| | |
|---|---|
| **Dakikalar içinde yayında** | Tek komutluk kurulum betiği Docker'ı hazırlar, alan adınız için otomatik HTTPS sertifikası alır ve tarayıcıda açılan kurulum sihirbazına yönlendirir. |
| **Ucuz sunucuda bile hızlı** | Tek süreç, varsayılan olarak SQLite; Redis, arama servisi ya da ayrı bir veritabanı sunucusu gerekmez. 1 GB RAM'li bir VPS yeterlidir. |
| **Kod yazmadan tam kontrol** | Tema, renkler, menüler, ana sayfa, izinler, e-posta şablonları, eklentiler… her şey yönetim panelinden. |
| **Tek tıkla güncelleme** | Yeni sürümler panelde sürüm notlarıyla görünür; kurulumdan önce yedek alınır, sorun olursa otomatik olarak geri dönülür. |
| **Güvenlik varsayılan olarak açık** | Yerleşik güvenlik duvarı (WAF), iki adımlı doğrulama, yönetimde yeniden doğrulama, sıkı içerik güvenliği politikası. |
| **Çok dilli** | Türkçe, İngilizce, Almanca, Çince, İspanyolca, Fransızca, Rusça ve Portekizce; her üye kendi dilini seçer. Türkçe arama ve isim karşılaştırmaları özel olarak desteklenir. |

## 🚀 Hızlı kurulum

Ubuntu, Debian, Rocky, Alma ya da Docker çalışabilen herhangi bir Linux sunucuda:

```bash
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/install.sh | sudo bash
```

Betik şunları yapar:

1. Docker yoksa (izninizle) kurar.
2. `/opt/inkforum` klasörünü, güvenli rastgele anahtarlarla `.env` dosyasını hazırlar.
3. Alan adı verdiyseniz Caddy ile **otomatik HTTPS** (Let's Encrypt) etkinleştirir.
4. InkForum'u başlatır ve size **kurulum adresini ve kurulum kodunu** gösterir.

Ardından tarayıcıda `https://alanadiniz.com/install` adresini açın. Sihirbaz sistemi denetler; forum adını, temayı,
yönetici hesabınızı, kayıt yöntemini, eklentileri ve (isteğe bağlı) e-posta ayarlarını sorar. Hepsi bu kadar.

> **Kurulum kodu neden var?** Kurulumu tamamlanmamış, internete açık bir sunucuyu başka birinin sahiplenmesini engeller.
> Kod yalnızca sunucu günlüğünde görünür: `docker compose -f /opt/inkforum/docker-compose.yml logs inkforum | grep "Kurulum kodu"`

### Elle kurulum (Docker Compose)

```bash
mkdir -p /opt/inkforum && cd /opt/inkforum
curl -fsSLO https://raw.githubusercontent.com/vokartz/inkforum/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/.env.example -o .env
# .env içinde APP_URL, APP_SECRET ve UPDATER_TOKEN değerlerini doldurun
docker compose up -d
```

### Coolify, Dokploy, Portainer

`docker-compose.yml` dosyasını doğrudan bu platformlara ekleyebilirsiniz. `APP_URL`, `APP_SECRET` (en az 32 karakter)
ve `UPDATER_TOKEN` (en az 16 karakter) ortam değişkenlerini tanımlamanız yeterlidir. Platform kendi ters vekilini
kullanıyorsa `TRUST_PROXY=uniquelocal` bırakın ve `caddy` profilini açmayın.

### Gereksinimler

| | En az | Önerilen |
|---|---|---|
| İşlemci | 1 vCPU (amd64 ya da arm64) | 2 vCPU |
| Bellek | 1 GB | 2 GB |
| Disk | 5 GB | 20 GB + yüklenen dosyalar |
| Yazılım | Docker 24+ ve Compose eklentisi | — |

Docker kullanamayan ortamlar (cPanel/Passenger, Plesk, doğrudan Node.js) için her sürümle birlikte
**sunucu paketi** de yayımlanır; bkz. [Docker'sız kurulum](#docker-sız-kurulum).

## ✨ Özellikler

<details open>
<summary><b>Forum</b></summary>

- Kategoriler, iç içe bölümler, bağlantı bölümleri, bölüm kapakları ve kural sayfaları
- Konu önekleri, etiketler, anketler, sabitleme, öne çıkarma, kilitleme, taşıma, birleştirme
- Zengin metin düzenleyici: başlıklar, tablolar, spoiler, kod, renkler, görsel yükleme, otomatik taslak
- YouTube, Twitch, Kick, Spotify, X, Instagram, TikTok, Discord davetleri dahil 24 sağlayıcıdan otomatik gömme
- Alıntı, @bahsetme, emoji tepkileri, itibar puanı, okunmamış içerik takibi, konu takibi
- Gelişmiş arama (Türkçe ek duyarlı), benzer konular, onay kuyruğu, düzenleme geçmişi
</details>

<details>
<summary><b>Üyelik ve topluluk</b></summary>

- Beş kayıt yöntemi (anında, e-posta doğrulamalı, yönetici onaylı, ikisi birden, kapalı), bot korumaları
- Gruplar, rütbeler (mesaj sayısına göre), süreli üyelikler, grup katılım istekleri
- Profiller: kapak fotoğrafı, özel alanlar, başarılar, imza, gizlilik ayarları
- Özel mesajlar (birebir ve grup), bildirimler ve e-posta bildirimleri
- Discord, Google ve GitHub ile giriş
</details>

<details>
<summary><b>Tasarım</b></summary>

- Üç tema: **Modern**, **Topluluk** (büyük banner) ve **Klasik** (SMF tarzı, modern dokunuşlarla)
- Açık/koyu mod, vurgu rengi, 9 yazı tipi, köşe yuvarlaklığı, banner, logo, arka planlar
- Sürükle-bırak menü yöneticisi ve ana sayfa blokları
- **Stüdyo**: tam ekran sürükle-bırak sayfa oluşturucu — tanıtım sayfaları, galeriler, sunucu kartı, geri sayım, fiyat tabloları, SSS…
- Görünümü tek tıkla varsayılana sıfırlama
- Tamamen mobil uyumlu; ana ekrana eklenebilir (PWA bildirimi)
</details>

<details>
<summary><b>Eklentiler</b></summary>

| Eklenti | Ne işe yarar |
|---|---|
| **Açılış sayfası** | Stüdyo'da hazırladığınız sayfa ana sayfa olur, forum otomatik olarak `/forum` adresine taşınır |
| **Wiki** | Sınırsız iç içe sayfa, içindekiler, arama, sayfa geçmişi |
| **Başvurular** | Ekip ve rol başvuruları: 8 soru türü, gereksinimler, inceleme, onayda otomatik grup ataması |
| **Destek talepleri** | Kategoriye göre sorumlu ekip, durumlar, öncelikler, iç notlar |
</details>

<details>
<summary><b>Arama motorları ve paylaşım</b></summary>

- Dinamik `robots.txt` ve otomatik `sitemap.xml` (yalnızca herkese açık içerik)
- Open Graph ve X kartları, kanonik adresler, yapılandırılmış veri (JSON-LD: tartışma gönderisi, profil, makale, içerik yolu)
- Konu paylaşıldığında otomatik üretilen **paylaşım görseli** (başlık, bölüm, yazar, istatistikler)
- oEmbed desteği ve başka sitelere gömülebilen konu kartları
- Google, Bing ve Yandex doğrulama kodları; yapay zekâ tarayıcılarını engelleme seçeneği
</details>

<details>
<summary><b>Güvenlik</b></summary>

- Yerleşik **güvenlik duvarı**: saldırı kalıbı engelleme, hız sınırı, kötü bot engeli, IP/aralık kuralları
- Saldırı altındayken doğrulama sayfası: yerleşik doğrulama, Cloudflare Turnstile ya da hCaptcha
- argon2id şifreler, iki adımlı doğrulama, oturum yönetimi, yönetim işlemlerinde yeniden doğrulama
- Sıkı içerik güvenliği politikası (CSP), CSRF koruması, SSRF korumalı webhook'lar
- IP, e-posta, alan adı ve üye yasakları; uyarı puanları ve otomatik yaptırımlar
</details>

<details>
<summary><b>Entegrasyon</b></summary>

- OAuth 2.0 sağlayıcı ("Forum hesabıyla giriş", PKCE), kapsamlı REST API, API anahtarları
- İmzalı webhook'lar (yeni konu, kayıt, grup değişimi…), UCP ve oyun paneli entegrasyonu için imzalı üye belirteci
- Özel HTML/CSS/JS parçacıkları (CSP nonce ile güvenli), `window.forum` JavaScript API'si
</details>

## 🔄 Güncellemeler

InkForum, yeni sürümleri bu depodaki [yayınlardan](https://github.com/vokartz/inkforum/releases) takip eder.

- **Yönetim → Güncellemeler** ekranı kurulu sürümü, yeni sürümü ve **sürüm notlarını** gösterir.
- **Şimdi güncelle** düğmesi: veritabanı yedeği alınır → yeni imaj indirilir → uygulama sağlık denetimiyle
  yeniden başlatılır → sorun olursa önceki sürüme **otomatik geri dönülür**. İlerleme canlı olarak izlenir.
- **Otomatik güncelleme**: kapalı, yalnızca düzeltmeler (1.2.x), düzeltmeler + yeni özellikler (1.x) ya da tümü;
  kurulumun yapılacağı gece saatini siz seçersiniz. Yeni sürüm çıktığında yöneticilere bildirim gider.
- **Kararlı / Beta** kanalı seçilebilir.

Komut satırından güncellemek isterseniz:

```bash
cd /opt/inkforum && docker compose pull && docker compose up -d
```

Veritabanı değişiklikleri açılışta otomatik uygulanır.

## 💾 Yedekleme ve geri yükleme

- **Yönetim → Bakım ve yedekler**: veritabanı kopyası, taşınabilir **SQL dökümü** ya da **tam yedek** (veritabanı + yüklenen dosyalar).
- Seçtiğiniz saatte günlük otomatik yedek; en yeni N yedek saklanır. Her güncellemeden ve geri yüklemeden önce de yedek alınır.
- **Yükle ve geri yükle**: bir yedeği (başka sunucudan da olabilir) yükleyin, onaylamak için `GERİ YÜKLE` yazın; InkForum yeniden
  başlarken yedeği uygular. Mevcut durum önce yedeklendiği için her zaman geri dönebilirsiniz.
- Tüm veriler (veritabanı, yüklenen dosyalar, yedekler) `inkforum-storage` Docker biriminde durur. Tam yedek için:

```bash
docker run --rm -v inkforum_inkforum-storage:/data -v "$PWD":/backup alpine tar czf /backup/inkforum-storage.tgz -C /data .
```

## 🚚 Başka forumdan taşıma

**SMF 2.x**, **phpBB 3.x**, **Invision Community 4/5** ya da **MyBB 1.8** kullanıyor musunuz? **Yönetim → Forum taşıma**
ekranına eski forumun MySQL dökümünü (`.sql` / `.sql.gz`) yükleyin. Platform, sürüm ve tablo öneki otomatik bulunur;
Türkçe karakter bozulmaları (ör. `ÅŸ`) önizlemeli olarak onarılır.

- Üyeler, gruplar (renkleriyle), rütbeler ve **rütbe görselleri**, kategori ve bölümler, **bölüm erişimleri** ve moderatörler
- Konular, mesajlar (alıntı ve bahsetmelerle), anketler, özel mesajlar, ekler, avatarlar ve yasaklar
- Üyeler **eski şifreleriyle** giriş yapar; ilk girişte şifre InkForum’un güvenli biçimine (argon2id) çevrilir
- Eski bağlantılar (`viewtopic.php?t=…`, `index.php?topic=…`, `showthread.php?tid=…`, `/topic/12-…`) yeni sayfalara yönlenir
- Başlamadan önce otomatik yedek alınır

## ⚙️ Yapılandırma

Forumla ilgili her ayar yönetim panelindedir. `.env` dosyası yalnızca altyapıyı belirler:

| Değişken | Açıklama |
|---|---|
| `APP_URL` | Sitenin tam adresi (`https://forum.ornek.com`) |
| `APP_SECRET` | Oturum ve şifreleme anahtarı (en az 32 karakter; değişirse oturumlar kapanır) |
| `UPDATER_TOKEN` | Güncelleyici kapsayıcıyla paylaşılan anahtar |
| `DOMAIN`, `COMPOSE_PROFILES=https` | Caddy ile otomatik HTTPS |
| `DB_DRIVER`, `DATABASE_URL` | PostgreSQL kullanmak için (`COMPOSE_PROFILES` içine `postgres` ekleyin) |
| `TRUST_PROXY` | Ters vekil arkasında gerçek IP için (`uniquelocal` önerilir) |
| `INKFORUM_PORT`, `INKFORUM_BIND` | Yayınlanan port ve dinlenen arayüz |
| `UPDATES_DISABLED` | İnternete çıkamayan sunucularda sürüm denetimini kapatır |
| `WAF_DISABLED` | Acil durumda güvenlik duvarını devre dışı bırakır |

## Docker'sız kurulum

Her sürümde `inkforum-<sürüm>-linux-x64.tar.gz` (bağımlılıklar dahil) ve `inkforum-<sürüm>.tar.gz` paketleri yayımlanır.
Node.js 22.13 veya üzeri gerekir.

```bash
curl -fsSLO https://github.com/vokartz/inkforum/releases/latest/download/inkforum-<sürüm>-linux-x64.tar.gz
tar xzf inkforum-*-linux-x64.tar.gz && cd inkforum
cp .env.example .env   # APP_URL ve APP_SECRET değerlerini doldurun
NODE_ENV=production node --env-file=.env server.mjs
```

Uygulamayı systemd, PM2 ya da Passenger ile çalıştırın; panelden yapılan güncellemeler paketi indirir, SHA-256 ile doğrular,
yerine kurar ve süreci yeniden başlatır (süreç yöneticisi otomatik yeniden başlatmalıdır). Örnek systemd birimi:

```ini
[Unit]
Description=InkForum
After=network.target

[Service]
WorkingDirectory=/opt/inkforum
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --env-file=.env server.mjs
Restart=always
User=inkforum

[Install]
WantedBy=multi-user.target
```

## ❓ Sık sorulan sorular

**Hangi veritabanını seçmeliyim?**
Çoğu topluluk için SQLite yeterli ve en az bakım gerektiren seçenektir (günlük on binlerce mesaj rahatça işlenir).
Çok büyük topluluklar ya da yönetilen veritabanı kullanmak isteyenler için PostgreSQL desteklenir.

**Sunucumun internete çıkışı yok, güncellemeler ne olacak?**
`UPDATES_DISABLED=true` ile denetimi kapatın; yeni imajı elle yükleyip `docker compose up -d` çalıştırmanız yeterli.

**Güvenlik duvarı yüzünden kendimi dışarıda bıraktım.**
`.env` içine `WAF_DISABLED=true` ekleyip `docker compose up -d` çalıştırın, ardından panelden ayarları düzeltin.

**Yönetici şifremi unuttum.**
Giriş sayfasındaki "Şifremi unuttum" bağlantısını kullanın. E-posta ayarlı değilse bağlantı `storage/mail` klasörüne yazılır:
`docker compose exec inkforum ls /app/storage/mail`

## 🐞 Hata bildirimi ve öneriler

Bir hata mı buldunuz ya da bir fikriniz mi var? [Issue açın](https://github.com/vokartz/inkforum/issues/new/choose); formlar
gereken ayrıntıları adım adım sorar. Forumunuzda **Yönetim → Sistem bilgisi → "GitHub'da hata bildir"** düğmesi sürüm ve ortam
bilgilerinizi forma otomatik doldurur. Güvenlik açıklarını lütfen [özel bildirim](https://github.com/vokartz/inkforum/security/advisories/new)
ile iletin ([SECURITY.md](SECURITY.md)).

## ☕ Projeye destek olun

InkForum küçük bir ekip tarafından geliştiriliyor. Topluluğunuza faydası olduysa geliştirmeye destek olabilirsiniz:

<a href="https://buymeacoffee.com/vokartz"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>

### 💛 Destekçiler

InkForum'u destekleyen herkese teşekkürler. Destekçiler izinleriyle burada listelenir.

<!-- SUPPORTERS:START -->
| | |
|---|---|
| *Adınız ya da topluluğunuz burada olabilir* | [Destekçi olun](https://buymeacoffee.com/vokartz) |
<!-- SUPPORTERS:END -->

Başka yollarla da destek olabilirsiniz: depoya ⭐ verin, hata bildirin, özellik önerin, InkForum'u kendi dilinize çevirin
ya da diğer topluluk yöneticilerine anlatın.

## Lisans

InkForum, [GNU AGPL-3.0](LICENSE) lisanslı özgür ve açık kaynak bir yazılımdır. Kullanabilir, inceleyebilir, değiştirebilir ve paylaşabilirsiniz;
değiştirilmiş bir sürümü başkalarına hizmet olarak çalıştırıyorsanız değişikliklerinizi aynı lisansla yayımlamanız gerekir.
Katkı vermek için: [CONTRIBUTING_tr.md](CONTRIBUTING_tr.md). Değişiklik geçmişi: [CHANGELOG_tr.md](CHANGELOG_tr.md). Güvenlik: [SECURITY.md](SECURITY.md).

<div align="center"><sub>© InkForum · Türkiye'de sevgiyle geliştirildi</sub></div>
