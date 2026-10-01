# Sürüm yayınlama

InkForum **açık kaynaktır** ([GNU AGPL-3.0](LICENSE)); kaynak kod, sürümler ve Docker imajı tek depodadır:
`github.com/vokartz/inkforum`.

```
 vokartz/inkforum (bu depo)
 ──────────────────────────
 kaynak kod, testler, CHANGELOG       git tag v1.2.0      Releases: inkforum-1.2.0*.tar.gz + SHA256SUMS
 .github/workflows/release.yml   ───────────────────▶      + sürüm notları (İngilizce + Türkçe)
                                                           ghcr.io/vokartz/inkforum:1.2.0 / 1.2 / latest
                                                           (amd64 + arm64)
```

Kurulu forumlar `https://api.github.com/repos/vokartz/inkforum/releases` adresini 6 saatte bir okur; yeni sürümü
**Yönetim → Güncellemeler** ekranında notlarıyla gösterir ve tek tıkla (ya da ayara göre otomatik) kurar.

## Bir kerelik hazırlık

- İş akışı GitHub'ın kendi anahtarıyla (`GITHUB_TOKEN`) yayın oluşturur ve imajı yükler; ek bir gizli anahtar gerekmez.
- **GHCR paketi herkese açık olmalı:** github.com/vokartz?tab=packages → `inkforum` → *Package settings* →
  *Change visibility* → Public. Aynı sayfada *Manage Actions access* altında `vokartz/inkforum` deposuna **Write**
  izni olduğundan emin olun. (Olmazsa `write:packages` izinli klasik bir belirteci `INKFORUM_RELEASE_TOKEN` adıyla
  depo gizli anahtarlarına ekleyin; iş akışı varsa onu kullanır.)

## Her sürümde

```bash
# 1) Değişiklikleri CHANGELOG.md (İngilizce, "## [Unreleased]") ve CHANGELOG_tr.md (Türkçe, "## [Yayımlanmamış]")
#    başlıkları altına yazın
# 2) Sürümü artırın (patch | minor | major | 1.4.0 | 1.4.0-beta.1)
pnpm release:version minor
# 3) Gözden geçirip gönderin
git add -A && git commit -m "release: v1.1.0"
git tag v1.1.0 && git push && git push origin v1.1.0
```

`v*` etiketi GitHub Actions'taki **Sürüm yayınla** iş akışını başlatır:

1. `INKFORUM_RELEASE=1 pnpm build`, lint, tip denetimi, testler
2. `scripts/release/build.mjs` → `inkforum-<sürüm>.tar.gz` ve `inkforum-<sürüm>-linux-x64.tar.gz` + `SHA256SUMS`
3. `docker/Dockerfile` → `ghcr.io/vokartz/inkforum:<sürüm>`, `:<ana.ara>`, `:latest` (ön sürümlerde `:beta`)
4. Sürüm notları: iki değişiklik günlüğündeki bölümler; boşsa önceki etiketten bu yana gelen commit mesajlarından
   (Conventional Commits: `feat:`, `fix:`, `perf:`, `security:`) otomatik üretilir
5. Bu depoda yayın oluşturulur

Yayından sonra notta hata fark ederseniz yalnızca `CHANGELOG.md` / `CHANGELOG_tr.md`'yi düzeltip gönderin;
**Sürüm notlarını güncelle** iş akışı yayınlanmış notları yeniden yazar.

Ön sürümler (`1.2.0-beta.1`) yalnızca Beta kanalını seçen forumlara görünür.

## Yerelde deneme

```bash
INKFORUM_RELEASE=1 pnpm build
pnpm release:build -- --no-archive          # release/inkforum/
cd release/inkforum && npm install --omit=dev
NODE_ENV=production APP_URL=http://localhost:3000 node server.mjs
# Docker imajı (depo kökünden):
docker build -f docker/Dockerfile -t inkforum:dev .
```

## Güncelleme mekanizması (özet)

- **Docker:** Uygulama kapsayıcısı Docker soketine erişmez. `updater` kapsayıcısı (aynı imaj, `node updater.mjs`)
  iç ağda paylaşılan anahtarla (`UPDATER_TOKEN`) istek alır; yalnızca `ghcr.io/vokartz/inkforum` imajını çeker,
  `inkforum.role=app` etiketli kapsayıcıyı aynı ayarlarla yeniden oluşturur, sağlık denetimini bekler, başarısızsa
  eski kapsayıcıyı geri getirir, en son kendini de günceller.
- **Sunucu paketi:** Uygulama paketi GitHub'dan indirir, `SHA256SUMS` ile doğrular, `.update/staging` içine açar,
  dosyaları değiştirir (öncekiler `.update/previous` içinde saklanır, panelden geri dönülebilir) ve süreç yöneticisinin
  yeniden başlatması için çıkar.
- **Kaynak kod:** `git pull && pnpm install && pnpm build`; panel yalnızca yeni sürümü bildirir.
- Her kurulumdan önce veritabanı yedeği alınır (`storage/backups/inkforum-…-pre-update-….db`).
