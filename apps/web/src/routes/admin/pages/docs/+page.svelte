<script lang="ts">
  import { TEMPLATE_VARIABLES } from '@forum/shared';
  import { toast } from 'svelte-sonner';
  import BookIcon from 'phosphor-svelte/lib/BookOpenText';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { t } from '$lib/i18n.svelte';

  /**
   * Özel sayfa geliştirme belgesi: HTML, f-* arayüz takımı, forum-* bileşenleri, CSS, tarayıcı API\'si,
   * sunucu kodu (handle, fetch, kv, secrets, token) ve tarifler. Kod örnekleri çevrilmez.
   */
  const toc = [
    ['overview', 'Genel bakış'],
    ['addresses', 'Adresler ve görünürlük'],
    ['layouts', 'Düzenler ve kenar çubuğu'],
    ['html', 'HTML ve şablon değişkenleri'],
    ['kit', 'Arayüz takımı (f-* sınıfları)'],
    ['components', 'Hazır bileşenler'],
    ['css', 'CSS ve tema renkleri'],
    ['js', 'Tarayıcı JavaScript API\'si'],
    ['server', 'Sunucu kodu'],
    ['request', 'İstek (req)'],
    ['forum-data', 'Forum verisi (forum.*)'],
    ['responses', 'Yanıtlar'],
    ['fetch', 'Dış servis çağrıları (fetch)'],
    ['kv', 'Veri saklama (kv)'],
    ['secrets', 'Gizli değerler ve kimlik belirteci'],
    ['api', 'Alt adresler ve sayfa API\'si'],
    ['recipes', 'Tarifler'],
    ['limits', 'Sınırlar ve güvenlik'],
  ] as const;

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t('Kopyalandı.'));
    } catch {
      toast.error(t('Kopyalanamadı.'));
    }
  }

  const KIT: Array<[string, string]> = [
    ['f-container / f-narrow', 'Ortalanmış içerik (site genişliği / okunaklı dar genişlik)'],
    ['f-stack', 'Alt alta, aralıklı dizilim (--f-gap ile aralık)'],
    ['f-row / f-between', 'Yan yana dizilim / iki uca yaslı'],
    ['f-grid', 'Kendiliğinden sütunlanan ızgara (--f-min ile en küçük kart genişliği)'],
    ['f-grid-2 / f-grid-3 / f-grid-4', 'Telefonda tek, geniş ekranda 2–4 sütun'],
    ['f-section / f-center', 'Dikey boşluklu bölüm / ortalanmış içerik'],
    ['f-card / f-card-flat / f-card-hover', 'Kart (gölgeli / gölgesiz / üzerine gelince öne çıkan)'],
    ['f-panel / f-hero', 'Soluk zeminli kutu / büyük karşılama alanı'],
    ['f-title / f-h2 / f-h3 / f-lead', 'Başlıklar ve giriş paragrafı'],
    ['f-muted / f-small / f-mono / f-accent / f-link', 'Soluk, küçük, eş aralıklı, vurgu renginde yazı, bağlantı'],
    ['f-btn (+ f-btn-outline, f-btn-ghost, f-btn-danger, f-btn-sm, f-btn-lg)', 'Düğmeler'],
    ['f-badge (+ -muted, -success, -warning, -danger)', 'Rozetler'],
    ['f-alert (+ -info, -success, -warning, -danger)', 'Uyarı kutuları'],
    ['f-label / f-input / f-select / f-textarea / f-check', 'Form alanları'],
    ['f-table / f-list / f-stat', 'Tablo, kart liste, istatistik kutusu'],
    ['f-avatar / f-img / f-divider / f-skeleton', 'Avatar (--size), görsel, ayırıcı, yükleniyor çubuğu'],
    ['f-tabs + forum-tabs', 'Sekmeler (Bileşenler bölümüne bakın)'],
    ['f-hidden-mobile / f-hidden-desktop', 'Telefonda / masaüstünde gizle'],
  ];

  const COMPONENTS: Array<[string, string]> = [
    ['<forum-user></forum-user>', 'Giriş yapan üyenin kartı (avatar, ad, grup, hesap bağlantısı); misafire giriş ve kayıt düğmeleri.'],
    ['<forum-login></forum-login>', 'Giriş / kayıt düğmeleri; üyeye hiçbir şey göstermez.'],
    ['<forum-stats></forum-stats>', 'Konu, mesaj ve üye sayıları.'],
    ['<forum-online limit="30"></forum-online>', 'Çevrimiçi üyelerin avatarları ve toplam sayı.'],
    ['<forum-recent limit="5"></forum-recent>', 'Son konular (en fazla 20).'],
    ['<forum-avatar user="12" size="48" name></forum-avatar>', 'Bir üyenin avatarı; name özniteliğiyle adı da yazılır.'],
    ['<forum-countdown to="2026-12-31T21:00:00+03:00" done="Başladı!"></forum-countdown>', 'Geri sayım; süre dolunca done yazısı görünür.'],
    ['<forum-tabs>…</forum-tabs>', 'Sekmeler: içinde data-tab düğmeleri ve data-f-panel bölümleri.'],
  ];

  const REQ: Array<[string, string]> = [
    ['req.kind', '"page": sayfa açılırken · "api": forum.api() ya da /api/page-api/… isteği'],
    ['req.method', 'GET, POST, PUT, PATCH, DELETE (sayfa açılışı her zaman GET)'],
    ['req.path', 'Sayfa adresinden sonraki kısım: /ucp → "/", /ucp/karakterler → "/karakterler"'],
    ['req.query', 'Sorgu dizesi: /ucp?sekme=2 → { sekme: "2" }'],
    ['req.body', 'İstek gövdesi (JSON ise nesne olarak)'],
    ['req.headers', 'content-type, accept, referer, user-agent'],
    ['req.user', 'Giriş yapan üye ya da null (alanlar aşağıda)'],
    ['req.ip', 'Ziyaretçinin IP adresi'],
    ['req.page', '{ id, slug, route, title, url }'],
  ];

  const USER: Array<[string, string]> = [
    ['id, username, name, url', 'Üye kimliği, kullanıcı adı, görünen ad, profil adresi'],
    ['email, emailVerified', 'Yalnızca sayfayı açan üyenin kendi e-postası ve doğrulanmış mı'],
    ['avatarUrl, color, title', 'Avatar adresi, grup rengi, özel unvan'],
    ['groups, primaryGroup', 'Grup kimlikleri dizisi ve baskın grubun kimliği'],
    ['groupList, group', 'Grupların ad ve rengiyle listesi; baskın grup { id, name, color }'],
    ['isAdmin, isStaff, permissions', 'Yönetici mi, yetkili mi, yetki anahtarları (ör. "mod.warnings.issue")'],
    ['postCount, reputation, achievementPoints, warningPoints', 'Mesaj sayısı, itibar, başarı puanı, uyarı puanı'],
    ['registeredAt, lastActiveAt, locale', 'Kayıt ve son etkinlik zamanı (ms), arayüz dili'],
  ];

  const FORUM: Array<[string, string]> = [
    ['forum.site', '{ name, description, url, locale, version, registrationOpen, now } — beklemeden kullanılır'],
    ['await forum.stats()', '{ members, topics, posts, newestMember, online: { members, guests, total } }'],
    ['await forum.online()', '{ members, guests, total, users: [üye…] } — durumunu gizleyenler listede yok'],
    ['await forum.user(kimlik ya da ad)', 'Herkese açık profil: ad, adres, avatar, gruplar, mesaj sayısı, kayıt tarihi, çevrimiçi mi, konum, yaş, özel alanlar, son başarılar. Bulunamazsa null'],
    ['await forum.members({ search, group, sort, dir, limit, page })', 'Üye listesi; sort: registered, name, posts, active, achievements → { total, items }'],
    ['await forum.groups()', 'Görünen gruplar: { id, name, description, color, memberCount, isMember }'],
    ['await forum.groupMembers(grupKimliği, limit)', 'Bir grubun üyeleri → { total, items }'],
    ['await forum.boards()', 'Kategoriler ve içlerindeki bölümler: ad, açıklama, adres, konu/mesaj sayısı, alt bölümler'],
    ['await forum.topics({ board, sort, limit })', 'Bölüm verilmezse son konular; board ile o bölümün konuları. sort: latest, newest, replies, views, title'],
    ['await forum.topic(kimlik)', 'Konu: başlık, adres, bölüm, yazar, yanıt ve görüntülenme sayısı, ilk mesajın html ve düz metni'],
    ['await forum.userTopics(kimlik ya da ad, limit)', 'Bir üyenin açtığı konular'],
    ['await forum.search(sorgu, { board, titleOnly, limit })', 'Konu araması'],
    ['await forum.token()', 'Giriş yapan üye için imzalı kimlik belirteci (aşağıda)'],
  ];

  const RES: Array<[string, string]> = [
    ['json(veri, durum?, başlıklar?)', 'Sayfa açılışında: veri forum.page.data ve {{data.*}} olarak sayfaya gelir. API isteğinde: JSON yanıt.'],
    ['html(metin, durum?)', 'Sayfa açılışında: sayfa içeriğinin yerine geçer (sunucuda üretilen HTML). API isteğinde: HTML yanıt (betik çalıştıramaz).'],
    ['text(metin, durum?)', 'Düz metin.'],
    ['redirect(adres, durum = 302)', 'Sunucu tarafında yönlendirme. Adres / ile başlamalı ya da http(s):// olmalı.'],
    ['notFound() / forbidden()', '404 ya da 403.'],
    ['hiçbir şey döndürmemek', 'Sayfa olduğu gibi gösterilir (API isteğinde 204).'],
  ];

  const SNIPPETS = {
    forumData: `async function handle(req) {
  // Paralel çağrılar daha hızlıdır
  const [stats, son, ben] = await Promise.all([
    forum.stats(),
    forum.topics({ limit: 5 }),
    req.user ? forum.user(req.user.id) : null,
  ]);

  // Dış sisteme forum verisi göndermek (İzinli alan adlarına ekleyin)
  if (req.kind === 'api' && req.path === '/senkron' && req.user) {
    await fetch('https://api.sunucum.com/forum-uyesi', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + secrets.API_KEY },
      body: { id: req.user.id, ad: req.user.name, eposta: req.user.email, gruplar: req.user.groupList.map((g) => g.name), mesaj: req.user.postCount },
    });
    return json({ ok: true });
  }

  return json({ forum: forum.site.name, uyeler: stats.members, cevrimici: stats.online?.total ?? 0, son, ben });
}`,
    tokens: `[data-custom-page="ucp"] .f-card {
  border-color: color-mix(in oklab, var(--primary) 40%, var(--border));
}
.benim-baslik { color: var(--primary); font-weight: 800; }`,
    js: `// Sayfanın sunucu verisi (handle() → json(...))
console.log(forum.page.data);

// Giriş yapan üye
if (!forum.viewer.isGuest) console.log(forum.viewer.displayName);

// Sayfanın sunucu koduna istek (POST, gövde JSON)
const sonuc = await forum.api('/oy', { body: { secim: 'a' } });

// Dış sisteminiz için imzalı kimlik belirteci (JWT)
const belirtec = await forum.token();

// Forum içinde sayfa değişince (sayfa yeniden yüklenmez)
forum.onNavigate((url) => console.log('yeni adres', url.pathname));`,
    server: `async function handle(req) {
  if (req.kind === 'page') {
    if (!req.user) return redirect('/login?next=' + encodeURIComponent(req.page.url));
    return json({ ad: req.user.name });
  }
  if (req.path === '/selam' && req.method === 'POST') {
    return json({ cevap: 'Merhaba ' + (req.user?.name ?? 'misafir') });
  }
  return notFound();
}`,
    fetch: `const res = await fetch('https://api.sunucum.com/oyuncular/' + req.user.id, {
  method: 'GET',
  headers: { Authorization: 'Bearer ' + secrets.UCP_API_KEY },
});
if (!res.ok) return json({ error: { message: 'Servis yanıt vermedi' } }, 502);
const oyuncu = await res.json();   // ya da await res.text()
// res.status, res.headers['content-type']`,
    kv: `await kv.set('sayac', 5);                    // kalıcı
await kv.set('oturum:' + req.user.id, { a: 1 }, 3600); // 1 saat sonra silinir
const n = await kv.get('sayac');              // yoksa null
await kv.delete('sayac');
const liste = await kv.list('oturum:');       // [{ key, value, expiresAt }]`,
    ssoRedirect: `// /ucp → kendi UCP sitenize tek oturumla geçiş
async function handle(req) {
  if (!req.user) return redirect('/login?next=' + encodeURIComponent(req.page.url));
  return redirect('https://ucp.sunucum.com/sso?token=' + encodeURIComponent(await forum.token()));
}`,
    verifyNode: `// UCP tarafı (Node.js): belirteci Özel kod → Entegrasyon'daki gizli anahtarla doğrulayın
import { createHmac, timingSafeEqual } from 'node:crypto';
function dogrula(token, secret) {
  const [h, p, s] = token.split('.');
  const beklenen = createHmac('sha256', secret).update(h + '.' + p).digest('base64url');
  if (!timingSafeEqual(Buffer.from(s), Buffer.from(beklenen))) return null;
  const veri = JSON.parse(Buffer.from(p, 'base64url').toString());
  return veri.exp * 1000 > Date.now() ? veri : null; // { sub: üye no, username, name, groups, … }
}`,
    apiJs: `forum.api('/karakterler').then((liste) => {
  document.getElementById('liste').innerHTML = liste
    .map((k) => '<div class="f-card"><b>' + k.ad + '</b></div>')
    .join('');
});`,
    apiServer: `async function handle(req) {
  if (req.kind === 'api' && req.path === '/karakterler') {
    const r = await fetch('https://api.sunucum.com/chars?forum=' + req.user.id, {
      headers: { 'X-Api-Key': secrets.UCP_API_KEY },
    });
    return json(await r.json());
  }
}`,
    formHtml: `<form action="/api/page-api/etkinlik/katil" method="post" class="f-card f-stack">
  <input class="f-input" name="ad" required>
  <button class="f-btn">Katıl</button>
</form>`,
    formServer: `async function handle(req) {
  if (req.kind === 'api' && req.path === '/katil' && req.method === 'POST') {
    if (!req.user) return redirect('/login');
    await kv.set('katilim:' + req.user.id, { ad: req.body.ad, zaman: Date.now() });
    return redirect('/etkinlik?tamam=1');      // form gönderiminden sonra sayfaya dön
  }
}`,
    tabs: `<forum-tabs>
  <div class="f-tabs">
    <button data-tab="genel">Genel</button>
    <button data-tab="kurallar">Kurallar</button>
  </div>
  <div data-f-panel="genel">…</div>
  <div data-f-panel="kurallar">…</div>
</forum-tabs>`,
  };
</script>

{#snippet code(src: string, lang = '')}
  <div class="group relative">
    <pre class="overflow-x-auto rounded-xl border bg-muted/50 p-4 font-mono text-[12.5px] leading-relaxed"><code data-lang={lang}>{src}</code></pre>
    <button type="button" class="absolute top-2 right-2 rounded-md border bg-card p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground" onclick={() => copy(src)} aria-label={t('Kopyala')}><CopyIcon class="size-4" /></button>
  </div>
{/snippet}

{#snippet table(rows: Array<[string, string]>, head: [string, string])}
  <div class="overflow-x-auto rounded-xl border">
    <table class="w-full text-sm">
      <thead class="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th class="px-3 py-2 font-semibold">{head[0]}</th><th class="px-3 py-2 font-semibold">{head[1]}</th></tr></thead>
      <tbody>
        {#each rows as [a, b] (a)}
          <tr class="border-t align-top"><td class="w-2/5 px-3 py-2 font-mono text-xs [overflow-wrap:anywhere]">{a}</td><td class="px-3 py-2 text-muted-foreground">{t(b)}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

<PageHeader icon={BookIcon} title={t('Özel sayfa belgeleri')} description={t('HTML, CSS ve JavaScript ile sayfa yazmak, hazır bileşenler ve sayfaya sunucu kodu eklemek için her şey.')}>
  {#snippet actions()}<Button href="/admin/pages" variant="outline"><ArrowLeftIcon />{t('Özel sayfalar')}</Button>{/snippet}
</PageHeader>

<div class="grid items-start gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]" data-part="page-docs">
  <nav class="hidden text-sm lg:sticky lg:top-20 lg:grid lg:gap-0.5" aria-label={t('İçindekiler')}>
    {#each toc as [id, label] (id)}
      <a href="#{id}" class="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">{t(label)}</a>
    {/each}
  </nav>

  <article class="grid min-w-0 max-w-3xl grid-cols-[minmax(0,1fr)] gap-10 [&_section]:grid-cols-[minmax(0,1fr)] text-[15px] leading-relaxed [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h3]:text-base [&_h3]:font-semibold [&_section]:grid [&_section]:gap-3">
    <section id="overview">
      <h2>{t('Genel bakış')}</h2>
      <p>{t('Özel sayfalar forumun içinde, kendi adresinde açılan sayfalardır: UCP, kurallar rehberi, etkinlik takvimi, başvuru formu, açılış sayfası… Bir sayfa dört parçadan oluşabilir:')}</p>
      <ul class="list-disc space-y-1 pl-5">
        <li><b>HTML</b> — {t('sayfanın içeriği. Hazır f-* sınıflarını ve <forum-…> bileşenlerini kullanabilirsiniz. İsterseniz BBCode da seçebilirsiniz.')}</li>
        <li><b>CSS</b> — {t('yalnızca bu sayfada yüklenen stiller.')}</li>
        <li><b>JavaScript</b> — {t('tarayıcıda, içerik çizildikten sonra çalışan kod.')}</li>
        <li><b>{t('Sunucu kodu')}</b> — {t('forum sunucusunda, yalıtılmış bir ortamda çalışan handle(req) işlevi: yönlendirme, veri hazırlama, kendi API uçlarınız, dış servis çağrıları.')}</li>
      </ul>
      <p class="rounded-xl border bg-primary-soft px-4 py-3 text-sm">{t('Hızlı başlangıç: Özel sayfalar → Yeni sayfa → Örnekler menüsünden "UCP" örneğini seçin, adresleri kendi sisteminize göre değiştirin, kaydedin.')}</p>
    </section>

    <section id="addresses">
      <h2>{t('Adresler ve görünürlük')}</h2>
      <p>{t('Her sayfa /pages/kisa-ad adresinden açılır. "Kök adres" yazarsanız sayfa doğrudan o adreste de açılır: ucp → /ucp. Kök adres "/" ile en fazla üç parça olabilir (ucp/karakterler). Forumun kendi adresleri (admin, forum, login, u, t…) kullanılamaz.')}</p>
      <p>{t('Sunucu kodu açıksa kök adresin altındaki tüm adresler de bu sayfaya gelir: /ucp/karakterler/5 açılınca req.path "/karakterler/5" olur. Sunucu kodu yoksa alt adresler 404 verir.')}</p>
      <p>{t('Görünürlük: herkes, yalnızca üyeler, yalnızca misafirler ya da seçili gruplar. Görmeye yetkisi olmayan ziyaretçi 404 alır; sunucu kodu hiç çalışmaz. Taslak sayfaları yalnızca yöneticiler görür.')}</p>
      <p>{t('Açılış sayfası: "Açılış sayfası" eklentisi açıksa bir sayfayı ana sayfa yapabilirsiniz (Özel sayfalar → ⋮ → Açılış sayfası yap); forum dizini /forum adresine taşınır.')}</p>
    </section>

    <section id="layouts">
      <h2>{t('Düzenler ve kenar çubuğu')}</h2>
      <ul class="list-disc space-y-1 pl-5">
        <li><b>{t('Kart')}</b> — {t('forumun üst çubuğu ve alt bilgisiyle, okunaklı genişlikte bir kart içinde.')}</li>
        <li><b>{t('Geniş')}</b> — {t('forum çerçevesinde, kartsız ve tam genişlikte; kendi tasarımınız için.')}</li>
        <li><b>{t('Ayrı site')}</b> — {t('forumun üst çubuğu ve alt bilgisi olmadan; sayfanın tamamı sizin (açılış sayfası, UCP).')}</li>
      </ul>
      <p>{t('Kart ve Geniş düzenlerde solda ya da sağda bir kenar çubuğu açabilirsiniz. Kenar çubuğu da HTML\'dir; içine bileşen ve f-* kartları koyabilirsiniz. Telefonda içeriğin altına iner.')}</p>
    </section>

    <section id="html">
      <h2>{t('HTML ve şablon değişkenleri')}</h2>
      <p>{t('HTML\'deki {{değişken}} yazıları ziyaretçiye göre doldurulur (değerler HTML için güvenli hâle getirilir):')}</p>
      {@render table(
        [...TEMPLATE_VARIABLES.filter((v) => v.scope === 'all').map((v) => [`{{${v.key}}}`, v.label] as [string, string]), ['{{data.alan}}', 'Sayfanın sunucu kodunun json() ile döndürdüğü veri (3 düzeye kadar: {{data.oyuncu.ad}})']],
        [t('Değişken'), t('Değer')],
      )}
      <p>{t('HTML içindeki <script> etiketleri de çalışır, ancak sayfaya özel kodu JavaScript sekmesine yazmanız önerilir. Dış betikler (CDN) için adresi Özel kod → Güvenlik bölümünde izinli kaynaklara ekleyin.')}</p>
    </section>

    <section id="kit">
      <h2>{t('Arayüz takımı (f-* sınıfları)')}</h2>
      <p>{t('Bu sınıflar sitenin temasını izler: renkler, köşeler, yazı tipi ve açık/koyu mod kendiliğinden uyar. Kendi CSS\'inizle birlikte kullanabilirsiniz.')}</p>
      {@render table(KIT, [t('Sınıf'), t('Ne işe yarar')])}
      {@render code(`<section class="f-hero f-stack">
  <span class="f-badge">Yeni</span>
  <h1 class="f-title">Sezon 3 başladı</h1>
  <p class="f-lead">Etkinlikler, ödüller ve yeni haritalar.</p>
  <div class="f-row"><a class="f-btn" href="/forum">Foruma git</a><a class="f-btn f-btn-outline" href="/ucp">UCP</a></div>
</section>
<div class="f-grid-3 f-section">
  <div class="f-card"><p class="f-h3">Kurallar</p><p class="f-muted">…</p></div>
  <div class="f-card"><p class="f-h3">Rehber</p><p class="f-muted">…</p></div>
  <div class="f-card"><p class="f-h3">Destek</p><p class="f-muted">…</p></div>
</div>`, 'html')}
    </section>

    <section id="components">
      <h2>{t('Hazır bileşenler')}</h2>
      <p>{t('HTML\'in herhangi bir yerine yazabileceğiniz canlı bileşenler. Herkese açık forum verisini kullanır, temaya uyar.')}</p>
      {@render table(COMPONENTS, [t('Bileşen'), t('Ne gösterir')])}
      <h3>{t('Sekmeler')}</h3>
      {@render code(SNIPPETS.tabs, 'html')}
    </section>

    <section id="css">
      <h2>{t('CSS ve tema renkleri')}</h2>
      <p>{t('Sayfanın CSS\'i yalnızca bu sayfada yüklenir. Temayla uyumlu kalmak için renkleri değişkenlerden alın: --primary, --primary-foreground, --background, --foreground, --card, --muted, --muted-foreground, --border, --link, --success, --warning, --destructive, --radius. Sayfanın kapsayıcısı data-custom-page="kisa-ad" özniteliğini taşır.')}</p>
      {@render code(SNIPPETS.tokens, 'css')}
    </section>

    <section id="js">
      <h2>{t('Tarayıcı JavaScript API\'si')}</h2>
      <p>{t('JavaScript sekmesindeki kod, içerik çizildikten sonra tarayıcıda çalışır ve window.forum nesnesini kullanabilir:')}</p>
      {@render code(SNIPPETS.js, 'js')}
      <p>{t('Forum tek sayfa uygulamasıdır: başka bir sayfaya geçince sayfanız kaldırılır, geri gelince kod yeniden çalışır. setInterval gibi zamanlayıcıları forum.onNavigate içinde temizleyin.')}</p>
    </section>

    <section id="server">
      <h2>{t('Sunucu kodu')}</h2>
      <p>{t('Sunucu sekmesindeki kod handle(req) adında bir işlev tanımlamalıdır. Sayfa açılırken ve sayfanın API\'sine istek geldiğinde forum sunucusunda çalışır. Kod JavaScript\'tir; async/await, JSON, Date, Math gibi standart özellikler vardır, ama Node.js modülleri, dosya sistemi ve setTimeout yoktur.')}</p>
      {@render code(SNIPPETS.server, 'js')}
      <p>{t('Kaydetmeden denemek için Sunucu sekmesindeki "Dene" kutusunu kullanın: yöntem, adres, sorgu ve gövde seçip kodu ben ya da misafir olarak çalıştırır; yanıtı, console.log çıktılarını ve hata satırını gösterir.')}</p>
    </section>

    <section id="request">
      <h2>{t('İstek (req)')}</h2>
      {@render table(REQ, [t('Alan'), t('Açıklama')])}
    </section>

    <section id="forum-data">
      <h2>{t('Forum verisi (forum.*)')}</h2>
      <p>{t('Sunucu kodu forumun verisini okuyabilir ve isterse fetch ile kendi sisteminize gönderebilir. Her çağrı sayfayı açan ziyaretçinin yetkileriyle yapılır: göremediği bölüm, gizli konu ya da gizli profil bilgisi burada da görünmez. Başka üyelerin e-posta ve IP adresleri hiçbir zaman verilmez. Çağrılar salt okunurdur; bir istekte en fazla 40 çağrı yapılabilir.')}</p>
      <h3>{t('req.user alanları')}</h3>
      {@render table(USER, [t('Alan'), t('Açıklama')])}
      <h3>{t('forum nesnesi')}</h3>
      {@render table(FORUM, [t('Kullanım'), t('Döndürdüğü')])}
      <p>{t('Üye nesneleri her yerde aynı biçimdedir: { id, username, name, url, avatarUrl, color, title, group }.')}</p>
      {@render code(SNIPPETS.forumData, 'js')}
    </section>

    <section id="responses">
      <h2>{t('Yanıtlar')}</h2>
      {@render table(RES, [t('İşlev'), t('Ne olur')])}
      <p>{t('json() dışında düz bir nesne döndürmek de JSON yanıt sayılır. Yanıt başlıklarından yalnızca content-type, cache-control, content-language ve x-* başlıkları geçer.')}</p>
    </section>

    <section id="fetch">
      <h2>{t('Dış servis çağrıları (fetch)')}</h2>
      <p>{t('fetch() yalnızca Sunucu sekmesindeki "İzinli alan adları" listesindeki adreslere istek atabilir (joker: *.ornek.com). Yerel ve özel ağ adresleri (127.0.0.1, 10.x, 192.168.x…) her zaman engellidir. Bir istekte en fazla 10 fetch, yanıt başına 1 MB ve 8 saniye sınırı vardır.')}</p>
      {@render code(SNIPPETS.fetch, 'js')}
    </section>

    <section id="kv">
      <h2>{t('Veri saklama (kv)')}</h2>
      <p>{t('Her sayfanın kendine ait bir anahtar-değer deposu vardır. Değerler JSON olarak saklanır (en fazla 64 KB); sayfa başına 5.000 anahtar. Süre verirseniz (saniye) anahtar o süre sonunda kendiliğinden silinir. Sayfa silinince tüm verisi silinir.')}</p>
      {@render code(SNIPPETS.kv, 'js')}
    </section>

    <section id="secrets">
      <h2>{t('Gizli değerler ve kimlik belirteci')}</h2>
      <p>{t('API anahtarı gibi değerleri Sunucu → Gizli değerler bölümüne ekleyin; kodda secrets.AD ile okunur. Değerler veritabanında şifreli saklanır, yönetim ekranında bile yeniden gösterilmez ve tarayıcıya hiç gönderilmez.')}</p>
      <p>{t('forum.token() giriş yapan üye için kısa ömürlü, imzalı bir kimlik belirteci (JWT, HS256) üretir. Dış sisteminiz belirteci Özel kod → Entegrasyon bölümündeki gizli anahtarla doğrulayıp üyenin kim olduğunu bilir; şifre paylaşmaya gerek kalmaz. Misafirde boş metin döner.')}</p>
      {@render code(SNIPPETS.verifyNode, 'js')}
    </section>

    <section id="api">
      <h2>{t('Alt adresler ve sayfa API\'si')}</h2>
      <p>{t('Sayfanın JavaScript\'i forum.api(yol, { method, body, query }) ile sunucu koduna istek atar; istek /api/page-api/kisa-ad/yol adresine gider ve handle() içinde req.kind === "api" olur. Bu adres formların action\'ında da kullanılabilir: handle() redirect() döndürürse tarayıcı yönlendirilir.')}</p>
      <div class="grid gap-3 md:grid-cols-2">{@render code(SNIPPETS.apiJs, 'js')}{@render code(SNIPPETS.apiServer, 'js')}</div>
      <h3>{t('JavaScript olmadan form')}</h3>
      <div class="grid gap-3 md:grid-cols-2">{@render code(SNIPPETS.formHtml, 'html')}{@render code(SNIPPETS.formServer, 'js')}</div>
    </section>

    <section id="recipes">
      <h2>{t('Tarifler')}</h2>
      <h3>{t('UCP: /ucp adresinden kendi UCP sitenize tek oturumla geçiş')}</h3>
      <p>{t('Kök adresi "ucp" olan bir sayfa oluşturun, sunucu kodunu açıp şunu yazın. Misafir giriş sayfasına, üye imzalı belirteçle UCP\'nize gider; UCP tarafında belirteci yukarıdaki gibi doğrulayın.')}</p>
      {@render code(SNIPPETS.ssoRedirect, 'js')}
      <h3>{t('UCP: forumun içinde panel')}</h3>
      <p>{t('UCP\'nizin API\'sini sunucu kodundan, gizli anahtarla çağırın; sayfanın JavaScript\'i forum.api() ile sonucu alıp f-* kartlarıyla çizsin. Hazır hâli: Yeni sayfa → Örnekler → "UCP: forum içinde panel".')}</p>
      <h3>{t('Yalnızca belirli gruplara açık sayfa')}</h3>
      <p>{t('Görünürlüğü "Seçili gruplar" yapın ya da sunucu kodunda req.user.groups listesine bakıp forbidden() döndürün.')}</p>
    </section>

    <section id="limits">
      <h2>{t('Sınırlar ve güvenlik')}</h2>
      <ul class="list-disc space-y-1 pl-5">
        <li>{t('Sunucu kodu QuickJS adlı yalıtılmış bir JavaScript motorunda çalışır; forum sunucusuna, dosyalara, veritabanına ve ağa doğrudan erişemez. Yalnızca bu belgede anlatılan köprüleri kullanabilir.')}</li>
        <li>{t('İstek başına sınırlar: 1 saniye işlemci süresi, 10 saniye toplam süre (fetch beklemeleri dahil), 32 MB bellek, 10 fetch. Sonsuz döngü kesilir ve hata olarak gösterilir.')}</li>
        <li>{t('Sayfa API\'si IP başına dakikada 120 istekle sınırlıdır.')}</li>
        <li>{t('HTML, CSS, JavaScript ve sunucu kodunu yalnızca "Özel kod" yetkisi olan yöneticiler değiştirebilir.')}</li>
        <li>{t('Özel kod Yönetim → Özel kod bölümünden kapatılırsa sayfaların HTML, CSS, JavaScript ve sunucu kodu hemen devre dışı kalır. Adrese ?safemode=1 eklemek de yalnızca sizin için özel kodu kapatır.')}</li>
        <li>{t('Sunucu kodundaki hatalar ziyaretçiye ayrıntı vermez (500); ayrıntıyı "Dene" kutusunda ve sunucu günlüğünde görürsünüz.')}</li>
      </ul>
    </section>
  </article>
</div>
