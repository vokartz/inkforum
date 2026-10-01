<div align="center">

<img src="apps/web/static/brand/inkforum-icon-192.png" alt="" width="72">

# InkForum’a katkı

**Modern, hafif ve baştan sona yönetilebilir topluluk yazılımı**

SvelteKit + NestJS · uçtan uca TypeScript · SQLite ya da PostgreSQL · tek süreç

[English](CONTRIBUTING.md) · **Türkçe** · [Kullanım ve kurulum](README_tr.md)

[Ürün](#ürün) · [Mimari](#mimari) · [Geliştirme](#geliştirme) · [Test](#test-ve-kalite) · [Yayınlama](RELEASING.md) · [Değişiklikler](CHANGELOG_tr.md)

</div>

---

> InkForum [GNU AGPL-3.0](LICENSE) lisanslı açık kaynak bir projedir. Hata bildirimleri ve pull request’ler memnuniyetle
> karşılanır; göndermeden önce `pnpm lint`, `pnpm typecheck` ve `pnpm test` komutlarını çalıştırın.

## Ürün

InkForum; oyun sunucuları, rol yapma toplulukları, markalar ve meraklı gruplar için geliştirilmiş, SMF / IPS sınıfında
bir forum yazılımıdır. Ucuz sunucularda çalışacak şekilde tasarlandı: **tek Node süreci**, varsayılan olarak **SQLite**,
Redis / S3 / arama servisi gerekmez.

| Alan | Öne çıkanlar |
|---|---|
| **Forum** | İç içe bölümler, önekler, etiketler, anketler, tepkiler ve itibar, alıntı / bahsetme, okunmamış takibi, gelişmiş arama (Türkçe ek duyarlı), 24 sağlayıcılı otomatik gömme |
| **Üyelik** | 5 kayıt yöntemi, gruplar ve rütbeler (SMF modeli), yetki matrisi ve bölüm yetki profilleri, 2FA, özel profil alanları, özel mesajlar, başarılar, uyarı puanları, yasaklar |
| **Tasarım** | Modern / Topluluk / Klasik (SMF) temaları, açık-koyu mod, vurgu rengi, 9 yazı tipi, menü ve ana sayfa düzenleyicileri, görünümü sıfırlama, tam mobil uyum |
| **Stüdyo** | Tam ekran sürükle-bırak sayfa oluşturucu (25 blok, şablonlar, özel CSS/HTML), açılış sayfası |
| **Eklentiler** | Açılış sayfası, Wiki, Başvurular, Destek talepleri — Yönetim → Eklentiler'den açılıp kapatılır |
| **SEO ve paylaşım** | Dinamik robots.txt, bölümlü sitemap, Open Graph / X kartları, JSON-LD, otomatik paylaşım görselleri, oEmbed ve gömülebilir konu kartları, PWA bildirimi |
| **Güvenlik** | Yerleşik WAF (saldırı kalıpları, hız sınırı, bot engeli, Turnstile / hCaptcha / yerleşik doğrulama), argon2id, CSP nonce, CSRF, SSRF korumalı webhook'lar, yönetimde yeniden doğrulama |
| **Entegrasyon** | OAuth 2.0 sağlayıcı (PKCE), kapsamlı REST API, API anahtarları, imzalı webhook'lar, sosyal giriş, UCP için imzalı üye belirteci |
| **İşletim** | Kurulum sihirbazı, GitHub üzerinden sürüm denetimi ve tek tıkla / otomatik güncelleme, günlük yedek, sistem durumu ve bakım araçları |

Kullanıcıya dönük tam özellik listesi ve kurulum belgesi: [README_tr.md](README_tr.md).

## Mimari

```
apps/
  server/        NestJS API; üretimde SvelteKit arayüzünü de aynı portta sunar
    src/install/     kurulum sihirbazı (ortam denetimi, site adresinin algılanması)
    src/updates/     GitHub sürüm denetimi, paket / Docker güncellemesi
    src/updater/     Docker güncelleyici kapsayıcı (Nest'siz, tek dosya)
    src/maintenance/ yedekler, sistem bilgisi
    src/seo/         robots, sitemap, oEmbed, paylaşım görselleri
  web/           SvelteKit arayüz (Svelte 5 runes, Tailwind v4, shadcn-svelte, Phosphor)
packages/
  shared/        Ortak tipler, zod şemaları, yetki / ayar / eklenti kayıt defterleri, BBCode, Markdown
  db/            Kysely şeması, SQLite (node:sqlite) / PostgreSQL sürücüleri, migration'lar
docker/          Çalışma imajı (yalnızca derlenmiş paketi içerir)
scripts/release/ Sürüm paketi, sürüm artırma, sürüm notu üretimi
storage/         Veritabanı, yüklemeler, yedekler, e-posta kayıtları (git'e girmez)
```

- **Tek süreç:** Express üzerinde NestJS; SvelteKit SSR, API'yi aynı süreçteki yerel bir soketten çağırır (ek port yok).
- **Veritabanı:** Kysely ile tek sorgu kodu; zamanlar epoch ms; migration'lar hem SQLite hem PostgreSQL (PGlite) üzerinde test edilir.
- **Önbellek ve kuyruk:** Bellek içi LRU + veritabanı sürüm sayaçları; veritabanı tabanlı iş kuyruğu ve zamanlanmış görevler.
- **Yetki:** Tek global `AccessGuard` sırasıyla kurulum durumu, eklenti, belirteç kapsamı, CSRF, hız sınırı, bakım/yasak, uyum ve yetkiyi denetler.
- **Sürüm:** Kök `package.json` sürümü; çalışma anında `config.version`. Dağıtım türü `INKFORUM_DEPLOY` ya da `forum.release` dosyasıyla algılanır.

## Gereksinimler

- **Node.js 22.13+** (önerilen 24 LTS) — yerleşik `node:sqlite` kullanılır, derleme gerekmez
- **pnpm 10**

## Geliştirme

```bash
pnpm install
cp .env.dev.example .env
pnpm dev
```

- Arayüz http://localhost:5173 (Vite, `/api` isteklerini API'ye yönlendirir) · API http://localhost:3000/api
- Boş bir veritabanıyla ilk açılışta **kurulum sihirbazı** (`/install`) açılır; kurulum kodu yoktur. Üretimde
  `APP_URL` verilmediyse sihirbazın açıldığı adres site adresi olur (`system_state` anahtarı `site:url`). `.env` içinde `ADMIN_PASSWORD` verilirse kurulum otomatik yapılır
  (`ADMIN_USERNAME` / `ADMIN_EMAIL` ile).
- Geliştirmede e-postalar gönderilmez; `storage/mail/*.eml` dosyalarına yazılır.
- Örnek üyeler ve örnek konular için: `pnpm db:seed:dev` (örnek üyelerin şifresi `Password123`)
  Örnek üyelerden **Deniz** yönetici grubundadır; yönetim panelini denemek için kullanılır (yalnızca geliştirme verisi, `seed-dev` ile oluşur).
- `packages/shared` değişince dev sunucusunu yeniden başlatın (tsup izleyicisi derler, API yeni şemaları açılışta yükler).

| Komut | Açıklama |
|---|---|
| `pnpm dev` | Paketleri, API'yi ve arayüzü izleme modunda başlatır |
| `pnpm build` | Tüm paketleri derler (`INKFORUM_RELEASE=1` ile sunucu kodu da küçültülür) |
| `pnpm start` | Derlenmiş uygulamayı tek portta çalıştırır |
| `pnpm test` | Tüm testler (SQLite) |
| `pnpm --filter @forum/server test:pg` | Sunucu testleri PostgreSQL (PGlite) üzerinde |
| `pnpm typecheck` / `pnpm lint` | Tip denetimi / ESLint |
| `pnpm release:version <tür>` | Sürümü artırır, CHANGELOG'u hazırlar |
| `pnpm release:build` | `release/inkforum` sürüm paketini ve arşivleri üretir |
| `pnpm release:notes <sürüm>` | Sürüm notlarını yazdırır |

## Test ve kalite

- Sunucu: Vitest + supertest uçtan uca testleri (kimlik, forum, yetkiler, WAF, kurulum, güncelleme, yedek, SEO,
  eklentiler…); her test kendi bellek içi veritabanıyla çalışır. CI hem SQLite hem PGlite matrisini ve gerçek
  PostgreSQL üzerinde açılışı dener (`.github/workflows/ci.yml`).
- Paylaşılan paket: BBCode güvenliği (XSS senaryoları), gömme sağlayıcıları, sürüm karşılaştırma, Markdown.
- Arayüz: `svelte-check` (tip denetimi) ve ESLint.

## Yapılandırma

Ortam değişkenlerinin tamamı `.env.example` dosyasında açıklanmıştır. Önemlileri: `APP_URL`, `APP_SECRET`,
`DB_DRIVER` / `DATABASE_URL`, `TRUST_PROXY`, `UPDATE_REPO` (varsayılan `vokartz/inkforum`), `UPDATES_DISABLED`,
`UPDATER_URL` / `UPDATER_TOKEN` (Docker), `DEFAULT_LOCALE`, `WAF_DISABLED`.

## Üçüncü taraf varlıklar

- Emoji görselleri: [Twemoji](https://github.com/jdecked/twemoji) (grafikler CC-BY 4.0, © Twitter / jdecked ve katkıda bulunanlar), `@twemoji/svg` paketiyle.
- Emoji adları ve kategorileri: [Emojibase](https://emojibase.dev) (MIT).
- İkonlar: [Phosphor Icons](https://phosphoricons.com) (MIT). Sosyal medya logoları: [Simple Icons](https://simpleicons.org) (CC0).

## Lisans

GNU AGPL-3.0 — bkz. [LICENSE](LICENSE). Katkı vererek katkılarınızın aynı lisansla yayımlanmasını kabul etmiş olursunuz.
