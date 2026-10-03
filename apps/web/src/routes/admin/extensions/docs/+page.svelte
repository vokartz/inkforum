<script lang="ts">
  import { EXTENSION_ID, EXTENSION_SLOTS, EXTENSION_SLOT_INFO } from '@forum/shared';
  import { toast } from 'svelte-sonner';
  import CodeIcon from 'phosphor-svelte/lib/Code';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeft';
  import ShieldWarningIcon from 'phosphor-svelte/lib/ShieldWarning';
  import DownloadIcon from 'phosphor-svelte/lib/DownloadSimple';
  import { Button } from '$lib/components/ui/button';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { t } from '$lib/i18n.svelte';

  const toc = [
    ['overview', 'Genel bakış'],
    ['quickstart', 'Hızlı başlangıç'],
    ['structure', 'Paket yapısı'],
    ['manifest', 'inkforum.json'],
    ['server', 'Sunucu kodu'],
    ['routes', 'API uçları'],
    ['pages', 'Sayfalar'],
    ['override', 'Forum sayfalarının yerine geçmek'],
    ['admin', 'Yönetim sayfaları'],
    ['account', 'Üye ayarları sayfaları'],
    ['slots', 'Yerler'],
    ['anywhere', 'Her sayfayı değiştirmek'],
    ['client', 'Tarayıcı kodu'],
    ['database', 'Veritabanı'],
    ['external', 'Başka veritabanı ve servisler'],
    ['settings', 'Ayarlar'],
    ['permissions', 'Yetkiler'],
    ['events', 'Olaylar ve görevler'],
    ['forum', 'Forum API\'si'],
    ['recipes', 'Tarifler'],
    ['publish', 'Paketleme ve dağıtım'],
    ['debug', 'Hata ayıklama ve güvenlik'],
  ] as const;

  let starterId = $state('');
  let starterName = $state('');
  const starterValid = $derived(EXTENSION_ID.test(starterId) && starterId !== 'docs');
  function downloadStarter() {
    if (!starterValid) return;
    const name = starterName.trim() || starterId.replace(/(^|-)([a-z])/g, (_m, sp: string, c: string) => `${sp ? ' ' : ''}${c.toUpperCase()}`);
    location.href = `/api/admin/extensions/starter?${new URLSearchParams({ id: starterId, name })}`;
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t('Kopyalandı.'));
    } catch {
      toast.error(t('Kopyalanamadı.'));
    }
  }

  const MANIFEST: Array<[string, string]> = [
    ['id', 'Benzersiz kimlik: küçük harf, rakam ve - (2-40 karakter). Klasör adı, API yolu (/api/ext/<id>) ve yetki önekidir.'],
    ['name, version, description, author', 'Yönetimde görünen ad, sürüm (1.2.3), açıklama ve geliştirici.'],
    ['icon', 'Phosphor simge adı (ör. game-controller, clipboard-text). Menüde ve listede görünür.'],
    ['inkforum', 'Uyumlu InkForum sürümü: ">=1.6.0", "^1.6.0" ya da "*". Uymayan sürümde eklenti kurulmaz.'],
    ['server', 'Sunucu kodu dosyası (ESM, .mjs). Yoksa eklenti yalnızca tarayıcı dosyalarından oluşur.'],
    ['client.scripts / client.styles', 'public/ klasöründen her forum sayfasında yüklenen JS modülleri ve CSS dosyaları.'],
    ['settings', 'Yönetimde otomatik form olarak çıkan ayarlar (aşağıda).'],
    ['permissions', 'Eklentinin yetkileri; Yönetim → Yetkiler ekranında gruplara verilir.'],
    ['nav', 'Üst menüye eklenen bağlantılar: label, url, icon, visibility (all / members / guests), permission.'],
    ['csp', 'Tarayıcının bağlanabileceği dış adresler: script, connect, style, font, frame, img (https:// kökleri).'],
  ];

  const CTX: Array<[string, string]> = [
    ['ctx.id, ctx.manifest, ctx.coreVersion, ctx.appUrl', 'Eklenti kimliği, bildirim bilgileri, InkForum sürümü ve forumun adresi.'],
    ['ctx.db, ctx.sql, ctx.tx(fn), ctx.table(ad)', 'Forum veritabanı (Kysely), sql etiketi, işlem ve ext_<id>_<ad> tablo adı.'],
    ['ctx.settings.get / all / set / onChange', 'Yönetimden girilen ayarlar (gizliler çözülmüş gelir).'],
    ['ctx.kv.get / set / delete / list', 'Basit kalıcı anahtar-değer deposu (isteğe bağlı süre).'],
    ['ctx.routes.get/post/put/patch/delete/all', 'API uçları: /api/ext/<id>/…'],
    ['ctx.pages.add', 'Forumda yeni sayfa (/ucp, /basvuru …).'],
    ['ctx.admin.page', 'Yönetim panelinde sayfa (menüde eklentinin altında).'],
    ['ctx.account.page', 'Üyenin kendi ayarlarında sayfa (/settings/ext/<id>/<key>).'],
    ['ctx.slots.add', 'Forum sayfalarındaki yerlere HTML ekleme.'],
    ['ctx.events.on', 'Forum olaylarını dinleme (yeni üye, yeni konu …).'],
    ['ctx.jobs.register / enqueue / schedule', 'Kalıcı kuyruk işleri ve düzenli görevler.'],
    ['ctx.forum.*', 'Üye, grup, bildirim, e-posta, kayıt, BBCode ve şifreleme yardımcıları.'],
    ['ctx.http.json/html/text/redirect/empty/error', 'Yanıt ve hata yardımcıları.'],
    ['ctx.log.info/warn/error', 'Yönetim → Eklentiler → Kayıtlar sekmesine yazar.'],
    ['ctx.dataDir, ctx.dir', 'Güncellemelerde korunan veri klasörü ve paket klasörü.'],
    ['ctx.onTeardown(fn)', 'Eklenti kapatılınca çalışacak temizlik (bağlantıları kapatın).'],
  ];

  const REQ: Array<[string, string]> = [
    ['req.method, req.path', 'Yöntem ve eklentinin köküne göre yol (/characters/12).'],
    ['req.params', 'Yol parametreleri: /characters/:id → { id: "12" }; "*" kalan yolu rest olarak verir.'],
    ['req.query, req.body', 'Sorgu dizesi ve JSON / form gövdesi (en fazla 1 MB).'],
    ['req.headers, req.ip', 'İstek başlıkları (çerez hariç) ve ziyaretçinin IP adresi.'],
    ['req.viewer', 'id, username, displayName, isGuest, isAdmin, groupIds, primaryGroupId, email, emailVerified, locale, can(yetki)'],
    ['req.raw.req, req.raw.res', 'Express isteği / yanıtı (dosya akışı gibi özel durumlar).'],
  ];

  const ROUTE_OPTS: Array<[string, string]> = [
    ['{ auth: true }', 'Yalnızca giriş yapmış üyeler (misafir 401 alır).'],
    ['{ permission: "manage" }', 'Yetki gerekir. Kısa ad bu eklentinin yetkisidir (ext.<id>.manage); tam ad da yazılabilir (admin.access).'],
    ['{ admin: true }', 'Yönetim yetkisi ve son dakikalarda şifre doğrulaması.'],
    ['{ rateLimit: { limit: 30, windowMs: 60000, by: "user" } }', 'Hız sınırı (IP ya da üye başına).'],
  ];

  const SETTING_TYPES: Array<[string, string]> = [
    ['text, textarea, url, color', 'Metin alanları (url http(s):// ile, color #rrggbb biçiminde denetlenir).'],
    ['number', 'Sayı; min / max verilebilir.'],
    ['boolean', 'Açık / kapalı anahtarı.'],
    ['select', 'options: [{ value, label }] listesinden seçim.'],
    ['secret', 'Şifreli saklanır, yönetimde maskelenir, tarayıcıya hiç gönderilmez (API anahtarı, veritabanı şifresi).'],
    ['groups', 'Grup seçimi; değer grup kimliklerinden oluşan dizi.'],
  ];

  const CLIENT: Array<[string, string]> = [
    ['inkforum.viewer', 'Giriş yapan üye: id, username, displayName, group, isGuest, avatarUrl.'],
    ['inkforum.ext(id).api(yol, { method, body, query })', 'Eklentinin API\'sine istek; hata olursa Error fırlatır.'],
    ['inkforum.ext(id).settings, .asset(yol)', 'Herkese açık (public: true) ayarlar ve public/ dosyasının adresi.'],
    ['inkforum.request(yol, init)', 'Forumun kendi API\'si (ör. /api/forum).'],
    ['inkforum.onNavigate(cb)', 'Forum içi sayfa geçişleri (sayfa yeniden yüklenmez).'],
    ['inkforum.goto(url), inkforum.toast(metin, tür)', 'Sayfa değiştirme ve kısa bildirim.'],
    ['inkforum.t(metin)', 'Forumun arayüz dilindeki çevirisi.'],
  ];

  const FORUM: Array<[string, string]> = [
    ['await ctx.forum.user(12 | "kullanici")', 'Üye: id, username, displayName, avatarUrl, email, groupIds, postCount …'],
    ['await ctx.forum.groups()', 'Tüm gruplar.'],
    ['ctx.forum.addToGroup(userId, groupId, { expiresAt })', 'Ek gruba ekler (başvuru onayı, VIP …). removeFromGroup ile çıkarılır.'],
    ['ctx.forum.notify(userId, "metin", { url })', 'Site içi bildirim (zil).'],
    ['ctx.forum.mail(to, konu, { html, text })', 'E-posta (kuyruğa alınır, forumun SMTP ayarıyla).'],
    ['ctx.forum.audit("islem", veri, actorId)', 'Yönetim → Kayıtlar (ext.<id>.islem).'],
    ['ctx.forum.setting("general.forumName")', 'Forumun herkese açık ayarları.'],
    ['ctx.forum.renderBBCode(kaynak)', 'BBCode → güvenli HTML.'],
    ['ctx.forum.encrypt / decrypt', 'Forumun anahtarıyla şifreleme (token saklamak için).'],
  ];

  const EVENTS: Array<[string, string]> = [
    ['user.registered, user.activated, user.emailVerified', '{ userId }'],
    ['user.loggedIn, user.profileUpdated, user.avatarChanged', '{ userId }'],
    ['user.groupsChanged, user.postCountChanged, user.warningPointsChanged', '{ userId }'],
    ['user.banned', '{ userId, banId }'],
    ['topic.created, post.created', '{ topicId, postId, userId, boardId }'],
    ['achievement.awarded', '{ userId, achievementId }'],
  ];

  const SNIPPETS = {
    quick: `# Node.js kuruluysa (paketlemek için)
node tools/inkforum-ext.mjs validate
node tools/inkforum-ext.mjs pack

# → ucp-0.1.0.zip  (Yönetim → Eklentiler → Eklenti yükle)`,
    tree: `ucp/
├─ inkforum.json        bildirim (zorunlu)
├─ server.mjs           sunucu kodu (isteğe bağlı)
├─ public/              tarayıcıya açık dosyalar → /ext-assets/ucp/…
│  ├─ client.js         her sayfada çalışan modül (isteğe bağlı)
│  ├─ panel.js          sayfa modülü
│  └─ style.css
├─ README.md            yönetimde "Bilgi" sekmesinde görünür
├─ package.json         bağımlılıklar (mysql2 gibi) ve komutlar
└─ node_modules/        (bağımlılık varsa paketle birlikte)`,
    manifest: `{
  "id": "ucp",
  "name": "Oyun Paneli",
  "version": "1.0.0",
  "description": "Karakterler, başvurular ve sunucu durumu",
  "author": "Ali",
  "icon": "game-controller",
  "inkforum": ">=1.6.0",
  "server": "server.mjs",
  "client": { "scripts": [], "styles": ["style.css"] },
  "settings": [
    { "key": "dbHost", "type": "text", "label": "Oyun veritabanı sunucusu", "section": "Bağlantı", "default": "127.0.0.1" },
    { "key": "dbPassword", "type": "secret", "label": "Veritabanı şifresi", "section": "Bağlantı" },
    { "key": "reviewers", "type": "groups", "label": "Başvuruları değerlendiren gruplar" }
  ],
  "permissions": [
    { "key": "view", "label": "Paneli görüntüleme", "defaults": { "member": 1 } },
    { "key": "review", "label": "Başvuru değerlendirme", "defaults": { "global_moderator": 1 } }
  ],
  "nav": [{ "label": "UCP", "url": "/ucp", "icon": "game-controller", "visibility": "members" }],
  "csp": { "img": ["https://cdn.oyunum.com"] }
}`,
    server: `import { defineExtension, html } from '@inkforum/sdk';

export default defineExtension({
  migrations: {
    '001_init': {
      async up(db, s) {
        await s.table('ext_ucp_applications')
          .addColumn('user_id', 'integer', s.notNull)
          .addColumn('answers_json', 'text', s.notNull)
          .addColumn('status', 'text', s.textDefault('pending'))
          .addColumn('created_at', 'bigint', s.notNull)
          .execute();
      },
    },
  },

  async setup(ctx) {
    ctx.log.info('UCP hazır');
    // Rotalar, sayfalar, yönetim sayfaları, yerler, olaylar burada kaydedilir
  },

  // Kapatılınca / güncellenince
  async teardown(ctx) {},

  // Kaldırırken "verileri de sil" seçilirse
  async uninstall(ctx) {
    await ctx.db.schema.dropTable('ext_ucp_applications').ifExists().execute();
  },
});`,
    routes: `ctx.routes.get('/characters', async (req) => {
  return ctx.db.selectFrom(ctx.table('characters'))
    .selectAll()
    .where('user_id', '=', req.viewer.id)
    .execute();                           // düz değer → JSON
}, { auth: true });

ctx.routes.post('/apply', async (req) => {
  const { answers } = req.body;
  if (!answers?.name) throw ctx.http.error(422, 'Karakter adı gerekli.');
  await ctx.db.insertInto('ext_ucp_applications')
    .values({ user_id: req.viewer.id, answers_json: JSON.stringify(answers), created_at: Date.now() })
    .execute();
  return ctx.http.json({ ok: true }, 201);
}, { auth: true, rateLimit: { limit: 5, windowMs: 600000, by: 'user' } });

ctx.routes.delete('/applications/:id', async (req) => {
  await ctx.db.deleteFrom('ext_ucp_applications').where('id', '=', Number(req.params.id)).execute();
  return ctx.http.empty();
}, { permission: 'review' });`,
    page: `ctx.pages.add({
  path: '/ucp/*',              // /ucp ve altındaki tüm adresler
  title: 'Oyun Paneli',
  layout: 'wide',              // default (kart) · wide · blank (forum çerçevesi yok)
  auth: true,                  // misafir giriş sayfasına yönlenir
  permission: 'view',
  async render(req) {
    if (req.params.rest === 'eski') return { redirect: '/ucp' };
    const chars = await loadCharacters(req.viewer.id);
    return {
      title: 'Karakterlerim',
      html: html\`<h2>Merhaba \${req.viewer.displayName}</h2>
        <ul>\${chars.map((c) => html\`<li>\${c.name} — \${c.level}. seviye</li>\`)}</ul>
        <div data-panel></div>\`,
      scripts: ['panel.js'],     // public/panel.js → mount(el, ctx)
      data: { chars },           // modülde ctx.data
    };
  },
});`,
    admin: `ctx.admin.page({
  key: 'applications',         // /admin/extensions/ucp/applications
  title: 'Başvurular',
  icon: 'clipboard-text',
  permission: 'review',
  async render(req) {
    const rows = await ctx.db.selectFrom('ext_ucp_applications').selectAll().orderBy('created_at', 'desc').execute();
    return {
      html: html\`<table class="w-full">\${rows.map((r) => html\`<tr><td>\${r.id}</td><td>\${r.status}</td></tr>\`)}</table>\`,
      scripts: ['admin-applications.js'],
    };
  },
});`,
    slots: `ctx.slots.add('profileTab', {
  title: 'Karakterler',
  async render(req) {
    const chars = await loadCharacters(req.profile.id);
    if (!chars.length) return null;           // bu profilde gösterme
    return html\`<ul>\${chars.map((c) => html\`<li>\${c.name}</li>\`)}</ul>\`;
  },
});

ctx.slots.add('homeSidebar', {
  title: 'Sunucu durumu',
  render: async () => ({ html: '<div data-status>…</div>', scripts: ['status.js'] }),
});`,
    client: `// public/client.js — inkforum.json → client.scripts; her forum sayfasında bir kez
export default function init(forum) {
  forum.onNavigate((url) => console.log('Yeni sayfa:', url.pathname));
}

// public/panel.js — sayfa ya da yer modülü
export function mount(el, ctx) {
  const box = el.querySelector('[data-panel]');
  const refresh = async () => {
    const chars = await ctx.api('/characters');
    box.textContent = chars.length + ' karakter';
  };
  refresh();
  const timer = setInterval(refresh, 30000);
  return () => clearInterval(timer);         // sayfadan çıkınca
}`,
    db: `// Okuma
const top = await ctx.db
  .selectFrom('users')
  .select(['id', 'username', 'post_count'])
  .orderBy('post_count', 'desc')
  .limit(10)
  .execute();

// Kendi tablonuz (adı ctx.table ile)
const visits = ctx.table('visits');        // "ext_ucp_visits"
await ctx.db.insertInto(visits).values({ user_id: 1, at: Date.now() }).execute();

// Ham SQL
const { rows } = await ctx.sql\`select count(*) as n from \${ctx.sql.table(visits)}\`.execute(ctx.db);

// İşlem
await ctx.tx(async () => { /* hepsi ya da hiçbiri */ });`,
    external: `// package.json → "dependencies": { "mysql2": "^3.11.0" }
// Paketlerken node_modules dahil edilir; dahil değilse forum kurulumda npm install çalıştırır.
import mysql from 'mysql2/promise';
import { defineExtension } from '@inkforum/sdk';

export default defineExtension({
  async setup(ctx) {
    let pool = null;
    const connect = () => {
      pool?.end();
      pool = mysql.createPool({
        host: ctx.settings.get('dbHost'),
        user: ctx.settings.get('dbUser'),
        password: ctx.settings.get('dbPassword'),   // secret: çözülmüş gelir
        database: ctx.settings.get('dbName'),
        connectionLimit: 5,
      });
    };
    connect();
    ctx.settings.onChange(connect);                 // ayar değişince yeniden bağlan
    ctx.onTeardown(() => pool?.end());

    ctx.routes.get('/server', async () => {
      const [rows] = await pool.query('SELECT COUNT(*) AS online FROM players WHERE online = 1');
      return { online: rows[0].online };
    });

    // Dış HTTP servisi
    ctx.routes.get('/status', async () => {
      const res = await fetch('https://api.oyunum.com/status', { headers: { authorization: 'Bearer ' + ctx.settings.get('apiKey') } });
      return res.json();
    });
  },
});`,
    events: `ctx.events.on('user.registered', async ({ userId }) => {
  const u = await ctx.forum.user(userId);
  await ctx.forum.notify(userId, 'Hoş geldin! Karakter başvurunu /ucp adresinden yapabilirsin.', { url: '/ucp' });
  ctx.log.info('Yeni üye: ' + u?.username);
});

// Kalıcı iş: forum yeniden başlasa da kaybolmaz, hata olursa yeniden denenir
ctx.jobs.register('sync-character', async ({ userId }) => { /* … */ });
ctx.events.on('user.profileUpdated', ({ userId }) => ctx.jobs.enqueue('sync-character', { userId }));

// Düzenli görev (en kısa 1 dakika)
ctx.jobs.schedule('cleanup', 60 * 60 * 1000, async () => {
  await ctx.db.deleteFrom(ctx.table('visits')).where('at', '<', Date.now() - 30 * 864e5).execute();
});`,
    apply: `// Başvuru onaylanınca üyeyi "Oyuncu" grubuna al ve bildir
ctx.routes.post('/applications/:id/approve', async (req) => {
  const id = Number(req.params.id);
  const app = await ctx.db.selectFrom('ext_ucp_applications').selectAll().where('id', '=', id).executeTakeFirst();
  if (!app) throw ctx.http.error(404, 'Başvuru bulunamadı.');
  await ctx.tx(async () => {
    await ctx.db.updateTable('ext_ucp_applications').set({ status: 'approved' }).where('id', '=', id).execute();
    await ctx.forum.addToGroup(app.user_id, ctx.settings.get('playerGroup'));
  });
  await ctx.forum.notify(app.user_id, 'Başvurun onaylandı!', { url: '/ucp' });
  await ctx.forum.audit('application.approve', { id }, req.viewer.id);
  return { ok: true };
}, { permission: 'review' });`,
    publish: `node tools/inkforum-ext.mjs pack
# → ucp-1.0.0.zip

# Yeni sürüm: inkforum.json → "version": "1.1.0" yapıp yeniden paketleyin ve aynı ekrandan yükleyin.`,
    override: `// Ana sayfayı tamamen değiştir: üyeye özel karşılama, sunucu durumu, karakterler…
ctx.pages.add({
  path: '/',
  override: true,
  title: 'Ana sayfa',
  layout: 'wide',
  async render(req) {
    if (req.viewer.isGuest) return { html: html\`<h1>Sunucumuza hoş geldin</h1><a href="/register">Kayıt ol</a>\` };
    const chars = await loadCharacters(req.viewer.id);
    return { html: html\`<h1>Tekrar hoş geldin \${req.viewer.displayName}</h1>\${chars.map((c) => html\`<p>\${c.name}</p>\`)}<a href="/forum">Foruma git</a>\` };
  },
});

// Profil sayfasının yerine RP karakter profili
ctx.pages.add({ path: '/u/*', override: true, title: 'Profil', render: async (req) => renderProfile(req.params.rest) });`,
    account: `ctx.account.page({
  key: 'karakter',                 // /settings/ext/ucp/karakter
  title: 'Karakter ayarları',
  icon: 'user-circle',
  async render(req) {
    const prefs = (await ctx.kv.get('prefs:' + req.viewer.id)) ?? { showAge: true };
    return { html: html\`<form data-prefs>…</form>\`, scripts: ['prefs.js'], data: prefs };
  },
});
ctx.routes.put('/prefs', async (req) => {
  await ctx.kv.set('prefs:' + req.viewer.id, req.body);
  return { ok: true };
}, { auth: true });`,
    report: `// Her mesajın altına "Şikayet et" düğmesi (şikayet sistemi)
ctx.slots.add('postActions', {
  render(req) {
    if (req.viewer.isGuest || req.post.authorId === req.viewer.id) return null;
    return { html: html\`<button class="cx-report" data-post="\${req.post.id}">Şikayet et</button>\`, scripts: ['report.js'] };
  },
});

// Konunun üstünde bilgi kutusu
ctx.slots.add('topicTop', {
  render: (req) => (req.topic.boardId === 5 ? '<div class="uyari">Bu bölümde kurallar katıdır.</div>' : null),
});`,
    anywhere: `// public/client.js — her sayfada; forumun data-part kancalarıyla istediğin yeri değiştir
export default function init(forum) {
  const apply = (url) => {
    // Bölüm sayfalarında her konu satırına sınıf ekle
    if (url.pathname.startsWith('/f/'))
      for (const row of document.querySelectorAll('[data-part="topic-row"]')) row.classList.add('rp-topic');
  };
  apply(new URL(location.href));
  forum.onNavigate(apply);
}`,
    ts: `// TypeScript: src/server.ts → server.mjs, src/public/*.ts → public/*.js
npm install -D esbuild typescript
node tools/inkforum-ext.mjs build
node tools/inkforum-ext.mjs pack`,
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

<PageHeader icon={CodeIcon} title={t('Eklenti geliştirme rehberi')} description={t('Foruma sayfa, yönetim ekranı, API, veritabanı tablosu ve daha fazlasını ekleyen InkForum eklentisi yazmak için her şey.')}>
  {#snippet actions()}<Button href="/admin/extensions" variant="outline"><ArrowLeftIcon />{t('Eklentiler')}</Button>{/snippet}
</PageHeader>

<div class="grid items-start gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]" data-part="extension-docs">
  <nav class="hidden text-sm lg:sticky lg:top-20 lg:grid lg:gap-0.5" aria-label={t('İçindekiler')}>
    {#each toc as [id, label] (id)}
      <a href="#{id}" class="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">{t(label)}</a>
    {/each}
  </nav>

  <article class="grid min-w-0 max-w-3xl grid-cols-[minmax(0,1fr)] gap-10 text-[15px] leading-relaxed [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h3]:text-base [&_h3]:font-semibold [&_section]:grid [&_section]:grid-cols-[minmax(0,1fr)] [&_section]:gap-3">
    <section id="overview">
      <h2>{t('Genel bakış')}</h2>
      <p>{t('Bir InkForum eklentisi, foruma neredeyse her şeyi ekleyebilen bir pakettir:')}</p>
      <ul class="list-disc space-y-1 pl-5">
        <li>{t('forumda yeni sayfalar (/ucp, /basvuru, /magaza …) ve kendi adresleri altındaki tüm alt sayfalar,')}</li>
        <li>{t('yönetim panelinde kendi ekranları ve otomatik oluşan ayarlar formu,')}</li>
        <li>{t('API uçları, kendi veritabanı tabloları, başka bir veritabanına (ör. oyun sunucusunun MySQL\'i) bağlantı,')}</li>
        <li>{t('üst menüye bağlantılar, profil sekmeleri, ana sayfa kartları gibi yerlere HTML,')}</li>
        <li>{t('her sayfada çalışan JavaScript ve CSS, yeni yetkiler, olay dinleyicileri ve zamanlanmış görevler.')}</li>
      </ul>
      <p class="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <ShieldWarningIcon class="mt-0.5 size-5 shrink-0 text-warning" weight="fill" />
        <span>{t('Eklentinin sunucu kodu forumla aynı süreçte ve tam Node.js yetkisiyle çalışır (WordPress eklentileri gibi). Yalnızca güvendiğiniz eklentileri kurun.')}</span>
      </p>
    </section>

    <section id="quickstart">
      <h2>{t('Hızlı başlangıç')}</h2>
      <p>{t('Başlangıç paketi çalışan bir örnek eklenti (sayfa, API ucu, yönetim sayfası, veritabanı tablosu), editörün kodu tanıması için tür tanımları ve paketleme aracını içerir. Hiçbir şey kurmanız gerekmez.')}</p>
      <form class="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onsubmit={(e) => (e.preventDefault(), downloadStarter())} data-part="starter-form">
        <label class="grid gap-1.5 text-sm font-medium">{t('Kimlik')}<input bind:value={starterId} class="h-9 rounded-md border bg-background px-3 font-mono text-sm outline-none focus:border-ring" placeholder="oyun-paneli" spellcheck="false" /></label>
        <label class="grid gap-1.5 text-sm font-medium">{t('Ad')}<input bind:value={starterName} class="h-9 rounded-md border bg-background px-3 text-sm outline-none focus:border-ring" placeholder="Oyun Paneli" /></label>
        <Button type="submit" disabled={!starterValid}><DownloadIcon />{t('Başlangıç paketini indir')}</Button>
        {#if starterId && !starterValid}<p class="text-xs text-destructive sm:col-span-3">{t('Kimlik küçük harfle başlamalı; yalnızca a-z, 0-9 ve - (2-40 karakter).')}</p>{/if}
      </form>
      <ol class="list-decimal space-y-1 pl-5">
        <li>{t('Zip\'i açın ve klasörü VS Code gibi bir editörde açın; server.mjs içinde ctx. yazınca tüm özellikler önerilir.')}</li>
        <li>{t('Değişikliklerinizi yapın, sonra klasörü paketleyin: Node.js kuruluysa aşağıdaki komutla, değilse inkforum.json, server.mjs, public/ ve README.md dosyalarını normal bir .zip yaparak.')}</li>
        <li>{t('Oluşan .zip dosyasını Yönetim → Eklentiler → Eklenti yükle ekranından yükleyin. Kurmadan önce eklentinin ne yapacağı (sunucu kodu, her sayfada betik, dış adresler, yetkiler) gösterilir.')}</li>
      </ol>
      {@render code(SNIPPETS.quick, 'bash')}
      <p>{t('Hazır örnekler için Eklentiler sayfasındaki "Hazır eklentiler" bölümünden Oyun Paneli ya da Şikayet Merkezi\'ni indirip inceleyebilirsiniz.')}</p>
      <p>{t('Geliştirirken eklenti klasörünü doğrudan sunucudaki storage/extensions/<id> klasörüne koyup "Klasörü tara" ile kaydedebilir, her değişiklikten sonra eklenti sayfasındaki "Yeniden yükle" düğmesine basabilirsiniz.')}</p>
    </section>

    <section id="structure">
      <h2>{t('Paket yapısı')}</h2>
      {@render code(SNIPPETS.tree)}
      <p>{t('Paket .zip ya da .tgz (npm pack çıktısı) olabilir; tek bir üst klasör içinde olması sorun değildir. Paket en fazla 50 MB olabilir.')}</p>
    </section>

    <section id="manifest">
      <h2>inkforum.json</h2>
      {@render table(MANIFEST, [t('Alan'), t('Açıklama')])}
      {@render code(SNIPPETS.manifest, 'json')}
      <p>{t('Bu alanlar package.json içinde "inkforum" anahtarının altına da yazılabilir; name, version ve description package.json\'dan alınır.')}</p>
    </section>

    <section id="server">
      <h2>{t('Sunucu kodu')}</h2>
      <p>{t('server.mjs varsayılan olarak defineExtension({ … }) dışa aktarır. setup(ctx) eklenti açılınca ve forum her başladığında çalışır; rotalar, sayfalar ve dinleyiciler burada kaydedilir. setup 30 saniye içinde bitmelidir.')}</p>
      {@render code(SNIPPETS.server, 'js')}
      <h3>{t('Bağlam (ctx)')}</h3>
      {@render table(CTX, [t('Kullanım'), t('Ne işe yarar')])}
    </section>

    <section id="routes">
      <h2>{t('API uçları')}</h2>
      <p>{t('ctx.routes ile kaydedilen uçlar /api/ext/<id>/<yol> adresinde çalışır. Düz bir değer döndürmek JSON yanıtıdır; hata için ctx.http.error(durum, mesaj) fırlatın. Forumun oturum, CSRF, bakım modu ve yasak denetimleri otomatik uygulanır.')}</p>
      {@render code(SNIPPETS.routes, 'js')}
      <h3>{t('İstek (req)')}</h3>
      {@render table(REQ, [t('Alan'), t('Açıklama')])}
      <h3>{t('Seçenekler')}</h3>
      {@render table(ROUTE_OPTS, [t('Seçenek'), t('Ne olur')])}
    </section>

    <section id="pages">
      <h2>{t('Sayfalar')}</h2>
      <p>{t('ctx.pages.add ile forumda kök adresli bir sayfa açılır. Forumun kendi adresleri (admin, forum, u, t, login …) ve başka bir eklentinin adresi kullanılamaz; özel sayfalar (Yönetim → Sayfalar) aynı adreste önce gelir.')}</p>
      {@render code(SNIPPETS.page, 'js')}
      <p>{t('html`…` etiketi değerleri otomatik kaçışlar (XSS\'e karşı); iç içe html`` ve diziler doğrudan eklenir. Kaçışlanmaması gereken hazır HTML için raw(metin) kullanın. Sayfa HTML\'indeki satır içi <script> etiketleri de çalışır, ancak modül kullanmanız önerilir.')}</p>
    </section>

    <section id="override">
      <h2>{t('Forum sayfalarının yerine geçmek')}</h2>
      <p>{t('override: true verilen sayfa, forumun kendi adresinin (ana sayfa "/", "/members", "/u/*", "/forum" …) yerine çizilir; adres çubuğu değişmez. Yönetim paneli, giriş / kayıt, üye ayarları ve API adresleri değiştirilemez. Aynı adresi yalnızca bir eklenti alabilir.')}</p>
      {@render code(SNIPPETS.override, 'js')}
      <p>{t('İpucu: sayfanın tamamını değiştirmek yerine yalnızca bir bölüm eklemek istiyorsanız yerleri (ctx.slots) kullanın; forumun güncellemelerinden daha az etkilenir.')}</p>
    </section>

    <section id="admin">
      <h2>{t('Yönetim sayfaları')}</h2>
      <p>{t('ctx.admin.page ile yönetim panelinde sayfa açılır; menüde "Eklentiler" grubunda eklentinin altında görünür. Ayarlar için ayrı sayfa yazmanız gerekmez: inkforum.json → settings alanından otomatik form oluşur.')}</p>
      {@render code(SNIPPETS.admin, 'js')}
    </section>

    <section id="account">
      <h2>{t('Üye ayarları sayfaları')}</h2>
      <p>{t('ctx.account.page ile üyenin kendi ayarlarına (Ayarlar → Eklentiler) sayfa eklenir: RP karakter tercihleri, bildirim seçenekleri, bağlı oyun hesabı … Üyeye özel verileri ctx.kv (ör. "prefs:<üye>") ya da kendi tablonuzda saklayın.')}</p>
      {@render code(SNIPPETS.account, 'js')}
    </section>

    <section id="slots">
      <h2>{t('Yerler')}</h2>
      <p>{t('ctx.slots.add ile forumun belirli yerlerine HTML eklenir. render() her ziyaretçi için çalışır (2 saniye sınırı); null döndürmek o ziyaretçiye göstermemek demektir.')}</p>
      {@render table(EXTENSION_SLOTS.map((s) => [s, EXTENSION_SLOT_INFO[s].description] as [string, string]), [t('Yer'), t('Nerede')])}
      {@render code(SNIPPETS.slots, 'js')}
      <p>{t('Yer bağlamı: profil yerlerinde req.profile, bölümde req.board, konu ve mesaj yerlerinde req.topic (id, title, boardId, authorId) ve req.post (id, authorId, isFirst) gelir. Konu ve mesaj yerleri yalnızca konuyu görebilen ziyaretçiler için çizilir.')}</p>
      {@render code(SNIPPETS.report, 'js')}
    </section>

    <section id="anywhere">
      <h2>{t('Her sayfayı değiştirmek')}</h2>
      <p>{t('Yerlerin ve sayfa değiştirmenin yetmediği durumlar için client.scripts her sayfada çalışır ve DOM\'a tam erişir. Forumun bileşenleri kararlı data-part öznitelikleri taşır (post, post-body, board-row, topic-row, profile-header, home-sidebar, page …); CSS ve JS ile bunları hedefleyebilirsiniz. client.styles ile tüm forumun görünümünü de değiştirebilirsiniz.')}</p>
      {@render code(SNIPPETS.anywhere, 'js')}
    </section>

    <section id="client">
      <h2>{t('Tarayıcı kodu')}</h2>
      <p>{t('Tarayıcı dosyaları public/ klasöründedir ve /ext-assets/<id>/… adresinden sunulur. client.scripts modülleri her forum sayfasında bir kez çalışır (default export init(forum)); sayfa, yönetim sayfası ve yer modülleri mount(el, ctx) dışa aktarır ve isterse temizlik işlevi döndürür.')}</p>
      {@render code(SNIPPETS.client, 'js')}
      <h3>window.inkforum</h3>
      {@render table(CLIENT, [t('Kullanım'), t('Ne işe yarar')])}
      <p>{t('Mount bağlamı (ctx): ext, forum (window.inkforum), data (sunucudaki render → data), api(yol, init), settings, asset(yol), url. Forumun renk değişkenleri CSS\'te kullanılabilir: var(--primary), var(--card), var(--border), var(--radius) …')}</p>
    </section>

    <section id="database">
      <h2>{t('Veritabanı')}</h2>
      <p>{t('ctx.db forumun Kysely bağlantısıdır (SQLite ya da PostgreSQL). Kendi tablolarınızı migrations içinde oluşturun; her migration bir kez çalışır ve kayıt eklentiye özeldir. Tablo adlarına ext_<id>_ öneki verin. Taşınabilirlik için zaman damgalarını bigint (ms), bayrakları smallint 0/1, JSON\'u text olarak saklayın.')}</p>
      {@render code(SNIPPETS.db, 'js')}
      <p>{t('Forumun tablolarını okuyabilirsiniz; yazmanız gerekiyorsa ctx.forum yardımcılarını tercih edin (sayaçlar ve önbellek tutarlı kalır).')}</p>
    </section>

    <section id="external">
      <h2>{t('Başka veritabanı ve servisler')}</h2>
      <p>{t('Sunucu kodu tam Node.js olduğu için istediğiniz kütüphaneyi kullanabilirsiniz: oyun sunucunuzun MySQL veritabanı, Redis, bir REST API … Bağımlılıkları package.json\'a yazın ve node_modules ile birlikte paketleyin (ya da esbuild ile tek dosyada birleştirin).')}</p>
      {@render code(SNIPPETS.external, 'js')}
    </section>

    <section id="settings">
      <h2>{t('Ayarlar')}</h2>
      <p>{t('inkforum.json → settings alanındaki her öğe yönetimde bir form alanı olur. Alanlar: key, type, label, hint, section (gruplar), default, required, min, max, placeholder, options, public (tarayıcıya gönderilsin mi).')}</p>
      {@render table(SETTING_TYPES, [t('Tür'), t('Açıklama')])}
    </section>

    <section id="permissions">
      <h2>{t('Yetkiler')}</h2>
      <p>{t('inkforum.json → permissions alanındaki yetkiler ext.<id>.<anahtar> adıyla kaydedilir ve Yönetim → Yetkiler ekranında "Eklentiler" kategorisinde görünür. defaults ile sistem gruplarına (guest, member, moderator, global_moderator) ilk kurulumda bir kez değer verilir. Kodda req.viewer.can("review") ya da rota seçeneği { permission: "review" } ile denetlenir; yöneticiler her zaman geçer.')}</p>
    </section>

    <section id="events">
      <h2>{t('Olaylar ve görevler')}</h2>
      {@render table(EVENTS, [t('Olay'), t('Veri')])}
      {@render code(SNIPPETS.events, 'js')}
    </section>

    <section id="forum">
      <h2>{t('Forum API\'si')}</h2>
      {@render table(FORUM, [t('Kullanım'), t('Ne yapar')])}
    </section>

    <section id="recipes">
      <h2>{t('Tarifler')}</h2>
      <h3>{t('Başvuru onaylanınca gruba alma')}</h3>
      {@render code(SNIPPETS.apply, 'js')}
      <h3>TypeScript</h3>
      {@render code(SNIPPETS.ts, 'bash')}
    </section>

    <section id="publish">
      <h2>{t('Paketleme ve dağıtım')}</h2>
      <p>{t('Eklentinizi .zip olarak paylaşın; forum yöneticileri Eklenti yükle ekranından kurar. Yeni sürüm yüklemek eklentiyi günceller: eski sürüm yedeklenir, ayarlar ve veriler korunur, yeni migration\'lar çalışır. İsterseniz npm\'de de yayımlayabilirsiniz; o zaman yöneticiler paket adını yazarak kurar.')}</p>
      {@render code(SNIPPETS.publish, 'bash')}
    </section>

    <section id="debug">
      <h2>{t('Hata ayıklama ve güvenlik')}</h2>
      <ul class="list-disc space-y-1 pl-5">
        <li>{t('ctx.log ve yakalanmayan hatalar eklenti sayfasındaki Kayıtlar sekmesinde görünür. setup() hata verirse eklenti açılmaz ve hata mesajı listede gösterilir.')}</li>
        <li>{t('Sayfa çizimi 15 saniye, yer çizimi 2 saniye içinde bitmelidir; uzun işleri ctx.jobs ile kuyruğa alın.')}</li>
        <li>{t('Bir eklenti forumu açılmaz hâle getirirse sunucuda INKFORUM_SAFE_MODE=1 ortam değişkenini verin ya da storage/extensions/.safemode adında boş bir dosya oluşturup forumu yeniden başlatın: hiçbir eklenti yüklenmez. Tarayıcı tarafı için adrese ?safemode=1 ekleyin.')}</li>
        <li>{t('Gizli değerleri (şifre, API anahtarı) secret türündeki ayarlarda saklayın; tarayıcıya asla gönderilmez. Kullanıcıdan gelen değerleri HTML\'e html`` etiketiyle yazın.')}</li>
        <li>{t('Eklenti kapatılınca rotaları, sayfaları, yerleri, olay dinleyicileri ve görevleri hemen devre dışı kalır; verileri silinmez.')}</li>
      </ul>
    </section>
  </article>
</div>
