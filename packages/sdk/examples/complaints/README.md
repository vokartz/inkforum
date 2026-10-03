# Şikayet Merkezi

InkForum için bilet (ticket) mantığında çalışan bir şikayet sistemi. Üyeler mesajları, üyeleri ve konuları
şikayet eder; ekip gelen şikayetleri bir kuyrukta önceliklendirir, üstlenir, yanıtlar ve sonuçlandırır.
Eklenti sisteminin neredeyse her parçasını kullanan kapsamlı bir örnektir.

## Özellikler

- **Mesajdan şikayet:** Her mesajın düğme çubuğunda **Şikayet et** düğmesi. Açılan pencerede kategori ve
  açıklama girilir. Kendi mesajında ve misafirlere görünmez.
- **Şikayet Merkezi (`/sikayetler`):** Üyenin kendi şikayetleri (durum rozetleri, son güncelleme), açık şikayet
  sayacı ve yeni şikayet formu. Hedef olarak bir üye (kullanıcı adıyla), bir konu (`/t/123` bağlantısı ya da
  numarası) ya da genel bir konu seçilebilir. `/sikayetler?uye=kullanici_adi` adresi formu o üyeyle doldurur.
- **Yazışma (`/sikayetler/<numara>`):** Şikayetin açıklaması, ekibin yanıtları ve durum değişiklikleri. Üye ek
  bilgi yazabilir ya da şikayeti kapatabilir. Başkasının şikayeti 404 döner; iç notlar üyeye hiç gönderilmez.
- **Ekip kuyruğu:** *Yönetim → Şikayet kuyruğu* ve yönetim paneline erişimi olmayan moderatörler için
  `/sikayetler/yonetim`. Durum sekmeleri (sayılarla), "Bana atananlar" süzgeci, üyeye göre süzme
  (`?user=<id>`), önceliğe göre sıralama ve sayfalama.
- **Şikayet ayrıntısı (`?id=<numara>`):** Şikayet edilen mesajın içeriği, konunun başlığı ya da üyenin
  durumu canlı gösterilir. Ekip durumu ve önceliği değiştirir, şikayeti üstlenir ya da kullanıcı adıyla
  başkasına atar, üyeye yanıt yazar veya yalnızca ekibin göreceği **iç not** ekler. Yanıtla birlikte durum da
  değiştirilebilir; atanmamış şikayete yanıt veren onu üstlenir.
- **Bildirimler:** Ekip yanıt verince ya da durumu değiştirince şikayet sahibine; şikayet sahibi yanıt yazınca
  veya şikayeti kapatınca atanan ekip üyesine; başkasına atama yapılınca atanan kişiye site içi bildirim gider.
- **Kayıtlar:** Ekibin tüm işlemleri *Yönetim → Kayıtlar*'a düşer (`ext.complaints.complaint.status`,
  `…priority`, `…assign`, `…reply`, `…note`).
- **Üye ayarları → Şikayetlerim:** Durumlara göre sayılar, yanıt bekleyen şikayet uyarısı ve son şikayetler.
- **Profil kartı:** Ekip, bir üyenin profilinde "Bu üye hakkında N açık şikayet" kartını görür (yalnızca N > 0
  ise); kart kuyruğu o üyeye süzülmüş olarak açar.
- **Yasaklama olayı:** Şikayet edilen üye yasaklanınca ona ait açık şikayetler otomatik olarak çözülür ve
  şikayet sahiplerine bildirilir.

## Durumlar ve öncelikler

| Durum              | Anlamı                                                       |
| ------------------ | ------------------------------------------------------------ |
| `open`             | Açık — ekip henüz ilgilenmedi                                |
| `in_review`        | İnceleniyor                                                  |
| `waiting_user`     | Yanıt bekleniyor — üye yanıt yazınca kendiliğinden geri döner |
| `resolved`         | Çözüldü (üye kapatınca da bu duruma geçer)                   |
| `rejected`         | Reddedildi                                                   |

Öncelikler: `low` (Düşük), `normal`, `high` (Yüksek), `urgent` (Acil). Aktif kuyruk önce önceliğe, sonra son
güncellemeye göre sıralanır.

## Yetkiler

| Yetki                         | Varsayılan                      | Açıklama                                               |
| ----------------------------- | ------------------------------- | ------------------------------------------------------ |
| `ext.complaints.file`         | Üyeler                          | Şikayet açma, kendi şikayetlerini görme ve yanıtlama  |
| `ext.complaints.handle`       | Moderatörler, genel moderatörler | Kuyruğu görme, durum / öncelik / atama, yanıt ve iç not |

Yetkiler yönetim panelindeki grup yetkileri ekranından grup başına değiştirilebilir.

## Ayarlar

| Ayar         | Tür          | Varsayılan                         | Açıklama                                          |
| ------------ | ------------ | ---------------------------------- | ------------------------------------------------- |
| `categories` | Çok satırlı  | Hakaret / küfür, Spam / reklam, …  | Her satır bir kategori                            |
| `maxOpen`    | Sayı         | 5                                  | Üye başına en fazla açık şikayet                  |
| `autoAck`    | Açık / kapalı | Açık                              | Yeni şikayete otomatik "Şikayetin alındı…" yanıtı |

## API

Tüm uçlar `/api/ext/complaints` altındadır ve JSON döner.

| Yöntem  | Yol                                 | Yetki    | Açıklama                                                         |
| ------- | ----------------------------------- | -------- | ---------------------------------------------------------------- |
| `GET`   | `/complaints`                       | `file`   | Kendi şikayetlerin                                               |
| `POST`  | `/complaints`                       | `file`   | Yeni şikayet (`category`, `subject`, `body`, `targetType`, …) — 10 dakikada 5 |
| `GET`   | `/complaints/:id`                   | `file`   | Kendi şikayetin ve yazışması                                     |
| `POST`  | `/complaints/:id/reply`             | `file`   | Yanıt (`body`)                                                   |
| `POST`  | `/complaints/:id/close`             | `file`   | Şikayeti kapat                                                   |
| `GET`   | `/staff/complaints`                 | `handle` | Kuyruk (`status`, `mine`, `user`, `page`)                        |
| `GET`   | `/staff/complaints/:id`             | `handle` | Şikayet ve iç notlar dahil yazışma                               |
| `PATCH` | `/staff/complaints/:id`             | `handle` | `status`, `priority`, `assignee` (`"me"`, kullanıcı adı ya da `null`) |
| `POST`  | `/staff/complaints/:id/messages`    | `handle` | Yanıt ya da iç not (`body`, `internal`, isteğe bağlı `status`)   |

`targetType` değerleri: `post` (`targetId` = mesaj numarası), `user` (`targetUser` = kullanıcı adı),
`topic` (`targetTopic` = `/t/123` ya da numara), `other`.

## Veritabanı

- `ext_complaints_items` — şikayetler (şikayet eden, hedef, kategori, başlık, açıklama, durum, öncelik, atanan)
- `ext_complaints_messages` — yazışma (yanıtlar, iç notlar, durum / atama olayları)

Eklenti kaldırılırken "verileri de sil" seçilirse iki tablo da silinir.

## Paketleme

```bash
node packages/sdk/bin/inkforum-ext.mjs validate packages/sdk/examples/complaints
node packages/sdk/bin/inkforum-ext.mjs pack packages/sdk/examples/complaints
```

Oluşan `complaints-1.0.0.zip` dosyasını **Yönetim → Eklentiler → Eklenti yükle** ekranından yükleyin.
