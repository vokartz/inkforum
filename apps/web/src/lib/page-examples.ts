/**
 * Özel sayfa düzenleyicisindeki hazır örnekler. Kod örnekleri çevrilmez (yorumlar Türkçe),
 * yalnızca başlık ve açıklamalar arayüz dilinde gösterilir.
 */
export interface PageExample {
  key: string;
  title: string;
  description: string;
  html?: string;
  css?: string;
  js?: string;
  sidebar?: string;
  server?: string;
  hosts?: string[];
  secrets?: string[];
}

export const DEFAULT_SERVER_CODE = `// Bu işlev sayfa açılınca (req.kind === 'page') ve sayfanın JS'i forum.api() ile
// istek attığında (req.kind === 'api') sunucuda, yalıtılmış bir ortamda çalışır.
async function handle(req) {
  if (req.kind === 'page') {
    // Misafiri giriş sayfasına gönder (sunucu tarafında yönlendirme)
    if (!req.user) return redirect('/login?next=' + encodeURIComponent(req.page.url));
    // Sayfaya veri: HTML'de {{data.ad}}, JS'te forum.page.data.ad
    return json({ ad: req.user.name });
  }

  // forum.api('/selam', { body: { mesaj: 'merhaba' } })
  if (req.path === '/selam' && req.method === 'POST') {
    return json({ cevap: 'Aldım: ' + req.body.mesaj });
  }
  return notFound();
}
`;

export const PAGE_EXAMPLES: PageExample[] = [
  {
    key: 'ucp-sso',
    title: 'UCP: tek oturumla yönlendirme',
    description: '/ucp açılınca üye imzalı bir belirteçle kendi UCP sitenize yönlendirilir; misafir giriş sayfasına gider.',
    server: `// /ucp → https://ucp.sunucum.com/sso?token=... (sunucu tarafında yönlendirme)
// UCP tarafında belirteci Özel kod → Entegrasyon bölümündeki gizli anahtarla doğrulayın.
async function handle(req) {
  if (!req.user) return redirect('/login?next=' + encodeURIComponent(req.page.url));
  const token = await forum.token();
  return redirect('https://ucp.sunucum.com/sso?token=' + encodeURIComponent(token));
}
`,
  },
  {
    key: 'ucp-panel',
    title: 'UCP: forum içinde panel (API köprüsü)',
    description: 'Karakter listesi kendi API\'nizden sunucu tarafında, gizli anahtarla çekilir; anahtar tarayıcıya hiç gitmez.',
    hosts: ['api.sunucum.com'],
    secrets: ['UCP_API_KEY'],
    html: `<div class="f-stack">
  <div class="f-between">
    <div>
      <h1 class="f-title">Kontrol paneli</h1>
      <p class="f-lead">Hoş geldin, {{data.name}}.</p>
    </div>
    <a class="f-btn f-btn-outline" href="/settings/profile">Hesap ayarları</a>
  </div>
  <div class="f-grid" id="karakterler">
    <div class="f-skeleton" style="height:6rem"></div>
  </div>
</div>`,
    js: `// Karakterleri sayfanın sunucu kodundan iste
const kutu = document.getElementById('karakterler');
forum.api('/karakterler').then((liste) => {
  kutu.innerHTML = liste.length
    ? liste.map((k) => \`<div class="f-card"><p class="f-h3">\${k.ad}</p><p class="f-muted f-small">Seviye \${k.seviye} · \${k.meslek}</p></div>\`).join('')
    : '<p class="f-muted">Henüz karakterin yok.</p>';
}).catch((e) => { kutu.innerHTML = '<div class="f-alert f-alert-danger">' + e.message + '</div>'; });`,
    server: `async function handle(req) {
  if (!req.user) return redirect('/login?next=' + encodeURIComponent(req.page.url));
  if (req.kind === 'page') return json({ name: req.user.name });

  if (req.path === '/karakterler') {
    const res = await fetch('https://api.sunucum.com/characters?forumId=' + req.user.id, {
      headers: { Authorization: 'Bearer ' + secrets.UCP_API_KEY },
    });
    if (!res.ok) return json({ error: { message: 'UCP şu an yanıt vermiyor.' } }, 502);
    const data = await res.json();
    return json(data.map((c) => ({ ad: c.name, seviye: c.level, meslek: c.job })));
  }
  return notFound();
}
`,
  },
  {
    key: 'form',
    title: 'Form: başvuruları sunucuda sakla',
    description: 'Basit bir form; gönderilenler sayfanın kv deposunda saklanır, aynı üye iki kez gönderemez.',
    html: `<form id="form" class="f-card f-stack" style="max-width:32rem">
  <h2 class="f-h2">Etkinliğe katıl</h2>
  <label class="f-label">Oyun içi adın <input class="f-input" name="ad" required maxlength="40"></label>
  <label class="f-label">Not <textarea class="f-textarea" name="not" maxlength="500"></textarea></label>
  <button class="f-btn">Gönder</button>
  <p id="durum" class="f-small f-muted"></p>
</form>`,
    js: `const form = document.getElementById('form');
const durum = document.getElementById('durum');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const veri = Object.fromEntries(new FormData(form));
  try {
    const r = await forum.api('/katil', { body: veri });
    durum.textContent = 'Kaydedildi! Sıra: ' + r.sira;
    form.reset();
  } catch (err) {
    durum.textContent = err.message;
  }
});`,
    server: `async function handle(req) {
  if (req.kind === 'page') return;
  if (req.path === '/katil' && req.method === 'POST') {
    if (!req.user) return json({ error: { message: 'Önce giriş yap.' } }, 401);
    const anahtar = 'katilim:' + req.user.id;
    if (await kv.get(anahtar)) return json({ error: { message: 'Zaten katıldın.' } }, 409);
    const sira = ((await kv.get('sayac')) ?? 0) + 1;
    await kv.set('sayac', sira);
    await kv.set(anahtar, { ad: String(req.body.ad).slice(0, 40), not: String(req.body.not ?? '').slice(0, 500), sira, zaman: Date.now() });
    return json({ sira });
  }
  return notFound();
}
`,
  },
  {
    key: 'landing',
    title: 'Açılış sayfası: tanıtım + canlı bileşenler',
    description: 'Büyük başlık, sunucu durumu yerine forum istatistikleri, son konular ve çevrimiçi üyeler.',
    html: `<section class="f-hero f-stack">
  <span class="f-badge">Sezon 3 başladı</span>
  <h1 class="f-title">Topluluğumuza hoş geldin</h1>
  <p class="f-lead">Haberler, rehberler ve etkinlikler burada.</p>
  <div class="f-row"><a class="f-btn f-btn-lg" href="/forum">Foruma git</a><forum-login></forum-login></div>
</section>
<section class="f-section f-grid-3">
  <div class="f-stack"><h2 class="f-h2">Sayılar</h2><forum-stats></forum-stats></div>
  <div class="f-stack"><h2 class="f-h2">Son konular</h2><forum-recent limit="5"></forum-recent></div>
  <div class="f-stack"><h2 class="f-h2">Çevrimiçi</h2><forum-online></forum-online></div>
</section>`,
  },
  {
    key: 'sidebar',
    title: 'Kenar çubuğu: üye kartı ve geri sayım',
    description: 'Sağ kenarda üye kartı, etkinlik geri sayımı ve son konular.',
    sidebar: `<forum-user></forum-user>
<div class="f-card f-stack f-gap-sm">
  <p class="f-h3">Sonraki etkinlik</p>
  <forum-countdown to="2026-12-31T21:00:00+03:00"></forum-countdown>
</div>
<forum-recent limit="5"></forum-recent>`,
  },
];
