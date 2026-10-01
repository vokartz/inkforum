<script lang="ts">
  import { API_SCOPES, API_SCOPE_INFO, WEBHOOK_EVENTS, WEBHOOK_EVENT_INFO, slugify } from '@forum/shared';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import CodeIcon from 'phosphor-svelte/lib/Code';
  import CopyIcon from 'phosphor-svelte/lib/Copy';
  import { cn } from '$lib/utils';
  import { t, tc } from '$lib/i18n.svelte';

  let { data } = $props();
  const base = $derived(page.url.origin);
  const forumName = $derived(String(data.viewer.settings['general.forumName'] ?? 'Forum'));

  const TOC = [
    { id: 'baslangic', label: 'Başlarken' },
    { id: 'oauth', label: 'OAuth 2.0 ile giriş' },
    { id: 'pkce', label: 'Tarayıcı / mobil (PKCE)' },
    { id: 'izinler', label: 'İzinler (scope)' },
    { id: 'api', label: 'REST API' },
    { id: 'anahtarlar', label: 'API anahtarları' },
    { id: 'webhooklar', label: "Webhook'lar" },
    { id: 'hatalar', label: 'Hatalar ve sınırlar' },
  ];

  // Kod örneklerindeki açıklamalar ve örnek değerler de çevrilir: anahtar, ${…} yerine {0}, {1}… içeren şablondur
  function ts(strings: TemplateStringsArray, ...values: string[]): string {
    const key = strings.reduce((acc, part, i) => acc + (i ? `{${i - 1}}` : '') + part, '');
    return tc(key).replace(/\{(\d+)\}/g, (m, i: string) => values[Number(i)] ?? m);
  }

  const S = '</' + 'script>';
  const samples = $derived({
    authorizeUrl: ts`${base}/oauth/authorize
  ?response_type=code
  &client_id=fc_XXXXXXXX
  &redirect_uri=https://ucp.ornek.com/auth/forum/callback
  &scope=profile%20email
  &state=RASTGELE_DEGER`,
    tokenCurl: ts`curl -X POST ${base}/api/oauth/token \\
  -u "fc_XXXXXXXX:fcs_GIZLI_ANAHTAR" \\
  -d grant_type=authorization_code \\
  -d code=GELEN_KOD \\
  -d redirect_uri=https://ucp.ornek.com/auth/forum/callback`,
    tokenResponse: ts`{
  "access_token": "fat_…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "frt_…",
  "scope": "profile email"
}`,
    userinfo: ts`curl ${base}/api/oauth/userinfo -H "Authorization: Bearer fat_…"

{
  "sub": "42",
  "username": "Ayşe",
  "name": "Ayşe",
  "picture": "${base}/uploads/avatars/…",
  "profile": "${base}/u/42",
  "groups": [{ "id": 3, "name": "Üye" }, { "id": 9, "name": "VIP" }],
  "primary_group": { "id": 9, "name": "VIP" },
  "email": "ayse@ornek.com",        // yalnızca "email" izniyle
  "email_verified": true
}`,
    php: ts`<?php
// 1) ${t('Giriş düğmesi: kullanıcıyı foruma yönlendir')}
session_start();
$_SESSION['state'] = bin2hex(random_bytes(16));
header('Location: ${base}/oauth/authorize?' . http_build_query([
  'response_type' => 'code',
  'client_id'     => 'fc_XXXXXXXX',
  'redirect_uri'  => 'https://ucp.example.com/callback.php',
  'scope'         => 'profile email',
  'state'         => $_SESSION['state'],
]));

// 2) callback.php: ${t('kodu belirtece çevir, üyeyi al')}
if (!hash_equals($_SESSION['state'], $_GET['state'] ?? '')) exit('${t('Geçersiz istek')}');
$ch = curl_init('${base}/api/oauth/token');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_USERPWD => 'fc_XXXXXXXX:fcs_SECRET',
  CURLOPT_POSTFIELDS => http_build_query([
    'grant_type' => 'authorization_code',
    'code' => $_GET['code'],
    'redirect_uri' => 'https://ucp.example.com/callback.php',
  ]),
]);
$token = json_decode(curl_exec($ch), true);
$ch = curl_init('${base}/api/oauth/userinfo');
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token['access_token']]]);
$user = json_decode(curl_exec($ch), true);
// $user['sub']: ${t('forumdaki üye numarası; kendi veritabanındaki hesapla eşleştir.')}`,
    pkce: ts`// ${t('Tarayıcıda / mobilde: gizli anahtar yok, PKCE zorunlu')}
const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
// ${t('yetkilendirme adresine ekle:')}  &code_challenge=\${challenge}&code_challenge_method=S256
// ${t('token isteğinde:')}  client_id=fc_…&code_verifier=\${verifier}  (${t('client_secret yok')})`,
    api: ts`# ${t('Konuları listele')} (read)
curl ${base}/api/boards/2 -H "Authorization: Bearer fat_…"

# ${t('Üye adına konu aç')} (write)
curl -X POST ${base}/api/boards/2/topics \\
  -H "Authorization: Bearer fat_…" -H "Content-Type: application/json" \\
  -d '{"title":"${t('Sunucu bakımı')}","body":"${t('[b]Bu gece[/b] 02:00-03:00 arası bakım var.')}","tags":["${t('duyuru')}"]}'

# ${t('Yanıt yaz')}
curl -X POST ${base}/api/topics/15/posts -H "Authorization: Bearer fat_…" \\
  -H "Content-Type: application/json" -d '{"body":"${t('Teşekkürler!')}"}'`,
    apikey: ts`# ${t('Sunucudan sunucuya (UCP arka ucu, bot): API anahtarı')}
curl "${base}/api/members?q=ali" -H "Authorization: Bearer fk_…"

# ${t('"admin" izinli anahtar: yönetim uç noktaları (ör. üye gruplarını eşitleme)')}
curl ${base}/api/admin/users/42 -H "Authorization: Bearer fk_…"`,
    webhook: ts`POST https://bot.example.com/forum-webhook
Content-Type: application/json
X-Forum-Event: topic.created
X-Forum-Delivery: 5b1d…
X-Forum-Signature: t=1790780000,v1=9f86d081884c7d65…

{
  "id": "5b1d…",
  "event": "topic.created",
  "createdAt": 1790780000000,
  "forum": "${base}",
  "data": {
    "topic": { "id": 15, "title": "${t('Sunucu bakımı')}", "url": "${base}/t/15/${slugify(t('Sunucu bakımı'))}" },
    "post": { "id": 88, "url": "${base}/p/88", "excerpt": "${t('Bu gece 02:00-03:00 arası…')}" },
    "board": { "id": 2, "name": "${t('Duyurular')}" },
    "author": { "id": 1, "username": "Admin", "displayName": "Admin" }
  }
}`,
    verifyNode: ts`import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(req, rawBody, secret) {
  const [t, v1] = String(req.headers['x-forum-signature']).split(',').map((p) => p.split('=')[1]);
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // ${t('5 dakikadan eski istekleri reddet')}
  const expected = createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  return v1.length === expected.length && timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}`,
    verifyPhp: ts`<?php
$raw = file_get_contents('php://input');
parse_str(str_replace(',', '&', $_SERVER['HTTP_X_FORUM_SIGNATURE'] ?? ''), $sig);
$expected = hash_hmac('sha256', $sig['t'] . '.' . $raw, 'whsec_…');
if (!hash_equals($expected, $sig['v1'] ?? '') || abs(time() - (int) $sig['t']) > 300) { http_response_code(401); exit; }
$event = json_decode($raw, true);`,
    error: ts`HTTP/1.1 403 Forbidden
{ "error": { "code": "FORBIDDEN", "message": "Bu erişim belirtecinin \\"write\\" izni yok." } }

// OAuth token uç noktası RFC 6749 biçiminde döner:
{ "error": "invalid_grant", "error_description": "Kod geçersiz ya da süresi dolmuş." }`,
    lightweight: ts`<!-- ${t('Forumun kendi sayfalarında (Yönetim → Özel kod) çalışan hafif yol')} -->
<script>
  window.forum.token().then((jwt) => fetch('https://ucp.example.com/api/me', { headers: { Authorization: 'Bearer ' + jwt } }));
${S}`,
  });

  async function copy(v: string) {
    try {
      await navigator.clipboard.writeText(v);
      toast.success(t('Kopyalandı.'));
    } catch {
      /* yok */
    }
  }
  const ENDPOINTS: Array<[string, string, string, string]> = [
    ['GET', '/api/forum', 'read', 'Kategoriler, bölümler, istatistikler'],
    ['GET', '/api/boards/:id', 'read', 'Bölüm ve konular (?page, ?sort)'],
    ['GET', '/api/topics/:id', 'read', 'Konu, mesajlar, anket, etiketler (?page)'],
    ['GET', '/api/search?q=', 'read', 'Konu ve mesaj arama'],
    ['GET', '/api/tags/:slug', 'read', 'Etiketteki konular'],
    ['GET', '/api/members', 'read', 'Üye listesi (?q, ?group, ?page)'],
    ['GET', '/api/users/:id', 'read', 'Üye profili'],
    ['POST', '/api/boards/:id/topics', 'write', 'Konu aç (title, body, tags, poll)'],
    ['POST', '/api/topics/:id/posts', 'write', 'Yanıt yaz (body)'],
    ['PUT', '/api/posts/:id/reaction', 'write', 'Tepki ver (reactionId)'],
    ['POST', '/api/topics/:id/poll/vote', 'write', 'Ankette oy kullan (optionIds)'],
    ['GET', '/api/messages', 'messages', 'Özel mesaj konuşmaları'],
    ['POST', '/api/messages', 'messages', 'Yeni konuşma (recipientIds, title, body)'],
    ['GET', '/api/oauth/userinfo', 'profile', 'Belirtecin sahibi olan üye'],
    ['GET', '/api/me/notifications', 'profile', 'Bildirimler'],
  ];
</script>

<svelte:head>
  <title>{t('Geliştirici belgeleri')} · {forumName}</title>
  <meta name="description" content={t("{name} API'si: OAuth 2.0 ile giriş, REST uç noktaları, API anahtarları ve webhook'lar.", { name: forumName })} />
</svelte:head>

{#snippet code(text: string, lang: string)}
  <div class="overflow-hidden rounded-lg border bg-muted/30">
    <div class="flex items-center border-b px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
      {lang}
      <button type="button" class="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground" onclick={() => copy(text)}><CopyIcon class="size-3.5" />{t('Kopyala')}</button>
    </div>
    <pre class="overflow-x-auto p-3 font-mono text-xs leading-5">{text}</pre>
  </div>
{/snippet}

<div class="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
  <nav class="hidden lg:block" aria-label={t('İçindekiler')}>
    <div class="sticky top-24 grid gap-0.5 text-sm">
      <p class="mb-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">{t('İçindekiler')}</p>
      {#each TOC as item (item.id)}
        <a href="#{item.id}" class="rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">{t(item.label)}</a>
      {/each}
    </div>
  </nav>

  <article class="grid min-w-0 gap-12 [&_h2]:scroll-mt-24 [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:tracking-tight [&_h3]:text-base [&_h3]:font-bold [&_p]:text-[15px] [&_p]:leading-relaxed">
    <header class="grid gap-3">
      <span class="flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary"><CodeIcon class="size-6" weight="bold" /></span>
      <h1 class="text-3xl font-extrabold tracking-tight">{t('{name} geliştirici belgeleri', { name: forumName })}</h1>
      <p class="max-w-3xl text-muted-foreground">
        {t("Kendi panelini (UCP), oyun sunucunu, Discord botunu ya da web siteni foruma bağla: üyeler forum hesabıyla giriş yapsın, verileri API ile oku ve yaz, olayları webhook'larla anında öğren.")}
      </p>
    </header>

    <section id="baslangic" class="grid gap-4">
      <h2>{t('Başlarken')}</h2>
      <div class="grid gap-3 sm:grid-cols-3">
        {#each [['OAuth 2.0', t('Üyeler kendi hesaplarıyla senin sitene giriş yapar; sen onların adına API kullanırsın.'), '#oauth'], [t('API anahtarı'), t('Sunucudan sunucuya erişim: bot, UCP arka ucu, senkronizasyon işleri.'), '#anahtarlar'], [t("Webhook'lar"), t('Yeni konu, kayıt, grup değişimi, yasak gibi olaylar adresine anında gönderilir.'), '#webhooklar']] as [ttl, d, h] (h)}
          <a href={h} class="rounded-xl border bg-card p-4 transition-colors hover:border-primary"><p class="font-bold">{ttl}</p><p class="mt-1 !text-sm text-muted-foreground">{d}</p></a>
        {/each}
      </div>
      <p class="text-muted-foreground">{t('Uygulama ve anahtarları forum yöneticisi')} <b>{t('Yönetim → Geliştiriciler ve API')}</b> {t("ekranından oluşturur. Tüm istekler HTTPS ve JSON'dur; tarihler milisaniye cinsinden Unix zamanıdır.")}</p>
    </section>

    <section id="oauth" class="grid gap-4">
      <h2>{t('OAuth 2.0 ile giriş (Authorization Code)')}</h2>
      <h3>{t('1. Üyeyi yetkilendirme sayfasına yönlendir')}</h3>
      {@render code(samples.authorizeUrl, 'URL')}
      <p class="text-muted-foreground">{t('Üye giriş yapmamışsa önce giriş yapar, sonra uygulamana hangi izinleri verdiğini gösteren onay ekranını görür. İzin verince')} <code>redirect_uri</code> {t('adresine')} <code>?code=…&state=…</code> {t('ile dönülür.')} <code>state</code> {t('değerini oturumunda saklayıp dönüşte mutlaka karşılaştır.')}</p>
      <h3>{t('2. Kodu erişim belirtecine çevir (sunucunda)')}</h3>
      {@render code(samples.tokenCurl, 'curl')}
      {@render code(samples.tokenResponse, 'JSON')}
      <p class="text-muted-foreground">{t('Kod 10 dakika geçerlidir ve tek kullanımlıktır. Erişim belirteci varsayılan 1 saat, yenileme belirteci 30 gün geçerlidir. Yenilemek için')} <code>grant_type=refresh_token&refresh_token=frt_…</code> {t('gönder; eski çift iptal olur ve yenisi döner.')}</p>
      <h3>{t('3. Üye bilgisini al')}</h3>
      {@render code(samples.userinfo, 'curl')}
      <h3>{t('Örnek: PHP ile "Forum ile giriş"')}</h3>
      {@render code(samples.php, 'PHP')}
    </section>

    <section id="pkce" class="grid gap-4">
      <h2>{t('Tarayıcı ve mobil uygulamalar (PKCE)')}</h2>
      <p class="text-muted-foreground">{t('Gizli anahtarını saklayamayan uygulamalar "Genel" türde oluşturulur ve PKCE (S256) kullanmak zorundadır.')}</p>
      {@render code(samples.pkce, 'JavaScript')}
    </section>

    <section id="izinler" class="grid gap-4">
      <h2>{t('İzinler (scope)')}</h2>
      <div class="overflow-hidden rounded-xl border">
        {#each API_SCOPES as s (s)}
          <div class="grid gap-1 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[8rem_1fr]">
            <code class="font-semibold">{s}</code>
            <span class="text-sm"><b>{t(API_SCOPE_INFO[s].label)}.</b> <span class="text-muted-foreground">{t(API_SCOPE_INFO[s].description)}</span></span>
          </div>
        {/each}
      </div>
      <p class="text-muted-foreground">{t('Belirteçle hesap ayarları değiştirilemez, şifre / oturum işlemleri yapılamaz; belirteç, üyenin forumda görebildiğinden fazlasını göremez.')}</p>
    </section>

    <section id="api" class="grid gap-4">
      <h2>REST API</h2>
      <p class="text-muted-foreground">{t('Tüm uç noktalar')} <code>{base}/api</code> {t('altındadır. Kimlik:')} <code>Authorization: Bearer &lt;{t('belirteç')}&gt;</code>.</p>
      <div class="overflow-x-auto rounded-xl border">
        <table class="w-full text-sm">
          <thead class="bg-panel-header text-xs text-muted-foreground"><tr><th class="px-3 py-2 text-left">{t('Yöntem')}</th><th class="px-3 py-2 text-left">{t('Yol')}</th><th class="px-3 py-2 text-left">{t('İzin')}</th><th class="px-3 py-2 text-left">{t('Açıklama')}</th></tr></thead>
          <tbody>
            {#each ENDPOINTS as [m, p, s, d] (m + p)}
              <tr class="border-t">
                <td class="px-3 py-2"><span class={cn('rounded px-1.5 py-0.5 font-mono text-[11px] font-bold', m === 'GET' ? 'bg-success/15 text-success' : m === 'POST' ? 'bg-primary-soft text-highlight' : 'bg-warning/15 text-warning')}>{m}</span></td>
                <td class="px-3 py-2 font-mono text-xs whitespace-nowrap">{p}</td>
                <td class="px-3 py-2"><code class="text-xs">{s}</code></td>
                <td class="px-3 py-2 text-muted-foreground">{t(d)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {@render code(samples.api, 'curl')}
    </section>

    <section id="anahtarlar" class="grid gap-4">
      <h2>{t('API anahtarları')}</h2>
      <p class="text-muted-foreground">{t('Yönetici tarafından belirli bir hesap adına ve seçili izinlerle oluşturulur')} (<code>fk_…</code>). {t('Üye etkileşimi gerektirmeyen arka plan işleri içindir.')} <code>admin</code> {t('izinli anahtarlar, bağlı olduğu hesabın yönetim yetkileriyle yönetim uç noktalarını kullanabilir; bu yüzden ayrı bir bot hesabı açıp yalnızca gereken yetkileri vermen önerilir.')}</p>
      {@render code(samples.apikey, 'curl')}
      <p class="text-muted-foreground">{t('Hafif yol: forumun kendi sayfalarına eklediğin özel kod (Yönetim → Özel kod), giriş yapmış üye için imzalı kısa ömürlü bir kimlik belirteci alabilir:')}</p>
      {@render code(samples.lightweight, 'HTML')}
    </section>

    <section id="webhooklar" class="grid gap-4">
      <h2>{t("Webhook'lar")}</h2>
      <div class="overflow-hidden rounded-xl border">
        {#each WEBHOOK_EVENTS as e (e)}
          <div class="grid gap-1 border-b px-4 py-2.5 last:border-b-0 sm:grid-cols-[12rem_1fr]"><code class="text-sm font-semibold">{e}</code><span class="text-sm text-muted-foreground">{t(WEBHOOK_EVENT_INFO[e])}</span></div>
        {/each}
      </div>
      {@render code(samples.webhook, 'HTTP')}
      <p class="text-muted-foreground">{t('2xx dışındaki yanıtlar ve zaman aşımları (10 sn) artan aralıklarla 6 kez yeniden denenir. Aynı olay birden fazla gelebilir;')} <code>X-Forum-Delivery</code> {t('değeriyle tekrarları ayıkla.')}</p>
      <h3>{t('İmzayı doğrulama')}</h3>
      {@render code(samples.verifyNode, 'Node.js')}
      {@render code(samples.verifyPhp, 'PHP')}
    </section>

    <section id="hatalar" class="grid gap-4">
      <h2>{t('Hatalar ve sınırlar')}</h2>
      {@render code(samples.error, 'JSON')}
      <ul class="grid list-disc gap-1.5 pl-5 text-[15px] text-muted-foreground">
        <li><code>401</code> {t('belirteç yok / geçersiz / süresi dolmuş,')} <code>403</code> {t('izin yok,')} <code>404</code> {t('bulunamadı ya da görme yetkin yok,')} <code>422</code> {t('doğrulama hatası')} (<code>error.fields</code>), <code>429</code> {t('hız sınırı.')}</li>
        <li>{t('Konu açma ve yanıt yazmada forumun normal kuralları (bölüm yetkileri, flood süresi, susturma, yasaklar) API için de geçerlidir.')}</li>
        <li>{t('Makine-okunur yapılandırma:')} <a href={`${base}/api/oauth/metadata`} class="text-link hover:underline">/api/oauth/metadata</a></li>
      </ul>
    </section>
  </article>
</div>
