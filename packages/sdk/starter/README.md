# __NAME__

InkForum eklentisi. Ayrıntılı rehber forumunuzda: **Yönetim → Eklentiler → Eklenti geliştir**.

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `inkforum.json` | Eklentinin kimliği, adı, sürümü, ayarları, yetkileri ve menü bağlantıları |
| `server.mjs` | Sunucu kodu: sayfalar, API uçları, yönetim sayfaları, veritabanı tabloları, olaylar |
| `public/` | Tarayıcıya giden dosyalar (`page.js` sayfa modülü, `style.css` her sayfada yüklenen stil) |
| `node_modules/@inkforum/sdk` | Editörün (VS Code) kodu tanıması için türler — yüklemeye eklenmez |
| `tools/inkforum-ext.mjs` | Denetleme ve paketleme aracı — yüklemeye eklenmez |

## Foruma yükleme

Node.js kurulu ise:

```bash
node tools/inkforum-ext.mjs pack
```

Oluşan `__ID__-0.1.0.zip` dosyasını **Yönetim → Eklentiler → Eklenti yükle** ekranından yükleyin.

Node.js yoksa klasördeki dosyaları (`inkforum.json`, `server.mjs`, `public/`, `README.md`) seçip normal bir .zip
yapmanız da yeterli. Sunucuya FTP ile erişiminiz varsa klasörü doğrudan `storage/extensions/__ID__` adıyla kopyalayıp
**Klasörü tara** düğmesine de basabilirsiniz.

Her değişiklikten sonra yeni sürümü yükleyin (ya da `inkforum.json` içindeki `version` değerini artırın); ayarlar ve
veriler korunur.
