import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig } from './config/config.js';
import { JobsService } from './jobs/jobs.service.js';
import { UsersService } from './users/users.service.js';
import { PasswordHasher } from './security/password-hasher.js';
import { GroupCacheService } from './groups/group-cache.service.js';
import { GroupsService } from './groups/groups.service.js';
import { PoliciesService } from './policies/policies.service.js';
import { Db } from './database/db.service.js';
import { SettingsService } from './settings/settings.service.js';
import { PermissionsService } from './permissions/permissions.service.js';
import { ForumCacheService } from './forum/forum-cache.service.js';
import { PostsService } from './forum/posts.service.js';
import type { RequestViewer } from './common/request-context.js';

/**
 * Komut satırı araçları:
 *   node dist/cli.js migrate      → migration'ları ve açılış uzlaştırmasını çalıştırır
 *   node dist/cli.js cron         → zamanı gelen görevleri ve bekleyen işleri çalıştırır (cPanel cron için)
 *   node dist/cli.js seed-dev     → geliştirme için örnek üyeler ve forum içeriği oluşturur
 */
async function main(): Promise<void> {
  const command = process.argv[2] ?? 'help';
  const config = loadConfig(process.env, { WORKER_ENABLED: 'false' });
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), { logger: ['error', 'warn', 'log'] });
  await app.init();

  try {
    switch (command) {
      case 'migrate':
        console.log('Veritabanı güncel.');
        break;
      case 'cron': {
        const jobs = app.get(JobsService);
        const ran = await jobs.runDueTasks();
        const processed = await jobs.drain(500);
        console.log(`Görevler: ${ran.join(', ') || '(yok)'} · İşlenen iş: ${processed}`);
        break;
      }
      case 'seed-dev':
        await seedDev(app);
        break;
      default:
        console.log('Kullanım: node dist/cli.js <migrate|cron|seed-dev>');
    }
  } finally {
    await app.close();
  }
}

async function seedDev(app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>): Promise<void> {
  const users = app.get(UsersService);
  const hasher = app.get(PasswordHasher);
  const cache = app.get(GroupCacheService);
  const groups = app.get(GroupsService);
  const policies = app.get(PoliciesService);
  const db = app.get(Db);
  const password = 'Password123';
  const hash = await hasher.hash(password);
  const gm = await cache.bySystemKey('global_moderator');
  const adminGroup = await cache.bySystemKey('admin');

  const samples: Array<{ username: string; primary?: number; posts: number }> = [
    { username: 'Moderatör Ali', primary: gm.id, posts: 420 },
    { username: 'Ayşe', posts: 1200 },
    { username: 'Mehmet', posts: 75 },
    { username: 'Zeynep', posts: 3 },
    { username: 'Can', posts: 260 },
    // Yönetim paneli denemeleri için (yalnızca geliştirme verisi)
    { username: 'Deniz', primary: adminGroup.id, posts: 90 },
  ];
  for (const s of samples) {
    if (await users.findByIdentifier(s.username)) continue;
    const email = `${s.username.toLowerCase().replace(/[^a-z]/g, '')}@example.com`;
    const user = await users.create({
      username: s.username,
      displayName: s.username,
      email,
      passwordHash: hash,
      status: 'active',
      emailVerifiedAt: Date.now(),
      ip: '127.0.0.1',
      primaryGroupId: s.primary ?? null,
    });
    await db.q.updateTable('users').set({ post_count: s.posts }).where('id', '=', user.id).execute();
    await policies.acceptAllCurrent(user.id, null);
  }
  await groups.recalcAllPostGroups();
  console.log(`Örnek üyeler hazır (şifre: ${password}): ${samples.map((s) => s.username).join(', ')}`);
  await seedForumContent(app, samples.map((s) => s.username));
}

/** Örnek konular ve yanıtlar (bir kez). */
async function seedForumContent(app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>, usernames: string[]): Promise<void> {
  const db = app.get(Db);
  const settings = app.get(SettingsService);
  const permissions = app.get(PermissionsService);
  const forum = app.get(ForumCacheService);
  const posts = app.get(PostsService);
  const users = app.get(UsersService);

  const exists = await db.q.selectFrom('topics').select('id').where('title', '=', 'Bugün ne dinliyorsunuz?').executeTakeFirst();
  if (exists) return;

  const viewers = new Map<string, RequestViewer>();
  for (const name of usernames) {
    const user = await users.findByIdentifier(name);
    if (!user) continue;
    const perms = await permissions.forUser(user);
    viewers.set(name, { user, session: null, groupIds: perms.groupIds, permissions: perms.permissions, isAdmin: perms.isAdmin, ip: '127.0.0.1', userAgent: 'seed' });
  }
  const as = (name: string) => viewers.get(name)!;
  const board = async (name: string) => (await forum.structure()).boards.find((b) => b.name === name)!;

  // Önekler
  const help = await board('Yardım ve Destek');
  const now = Date.now();
  for (const [i, p] of [
    { name: 'Soru', color: '#3b82f6' },
    { name: 'Çözüldü', color: '#22c55e' },
  ].entries()) {
    await db.q.insertInto('topic_prefixes').values({ name: p.name, color: p.color, board_ids_json: JSON.stringify([help.id]), sort_order: i, created_at: now }).execute();
  }
  await forum.invalidate();
  const prefixes = await forum.prefixesFor(help.id);

  const flood = settings.get('forum.floodSeconds');
  await settings.set('forum.floodSeconds', 0);
  try {
    const t1 = await posts.createTopic(as('Ayşe'), (await board('Genel Sohbet')).id, {
      title: 'Bugün ne dinliyorsunuz?',
      body: `Çalışırken ne dinlediğinizi merak ediyorum. Ben bugün [b]lo-fi[/b] listesiyle başladım 🎧

Sizin önerileriniz neler?`,
      prefixId: null,
      tags: ['müzik', 'öneri'],
      poll: null,
      subscribe: true,
    });
    await posts.reply(as('Mehmet'), t1.topicId, 'Ben genelde [i]film müzikleri[/i] dinliyorum. Hans Zimmer favorim.');
    const q = await posts.quote(as('Can'), t1.postId);
    await posts.reply(as('Can'), t1.topicId, `${q.bbcode}Lo-fi harika bir seçim, katılıyorum! [color=#16a34a]Odaklanmaya çok yardımcı oluyor.[/color]`);
    await posts.reply(as('Zeynep'), t1.topicId, 'Podcast dinleyen yok mu? 😄');

    const t2 = await posts.createTopic(as('Zeynep'), help.id, {
      title: 'Profil fotoğrafımı nasıl değiştirebilirim?',
      body: 'Merhaba, yeni üyeyim. Profil fotoğrafımı nereden değiştirebilirim?',
      prefixId: prefixes.find((p) => p.name === 'Soru')?.id ?? null,
      tags: ['profil', 'yardım'],
      poll: null,
      subscribe: true,
    });
    await posts.reply(
      as('Moderatör Ali'),
      t2.topicId,
      `Hoş geldin! Şu adımları izleyebilirsin:
[list=1]
[*]Sağ üstteki profil resmine tıkla.
[*][b]Ayarlar → Profil[/b] sayfasına git.
[*]"Fotoğraf yükle" butonunu kullan.
[/list]
Fotoğraf otomatik olarak kırpılır.`,
    );
    await posts.reply(as('Zeynep'), t2.topicId, 'Teşekkürler, oldu! 🙏');

    await posts.createTopic(as('Can'), (await board('Tanışma')).id, {
      title: 'Merhaba, ben Can',
      body: `[center][size=5]Herkese merhaba! 👋[/size][/center]

İstanbul'dan yazıyorum, yazılım geliştiriciyim. Forumda yeni konulara katılmak için sabırsızlanıyorum.`,
      prefixId: null,
      tags: ['tanışma'],
      poll: null,
      subscribe: true,
    });

    const t4 = await posts.createTopic(as('Mehmet'), (await board('Konu Dışı')).id, {
      title: 'En sevdiğiniz oyun hangisi?',
      body: `Herkes bir oyun yazsın, kısaca neden sevdiğini de anlatsın.

[spoiler=Benim cevabım]The Witcher 3 — hikâyesi ve yan görevleri eşsiz.[/spoiler]`,
      prefixId: null,
      tags: ['oyun', 'sohbet'],
      poll: { question: 'En çok hangi türü oynuyorsunuz?', options: ['Rol yapma (RP)', 'Açık dünya', 'Rekabetçi FPS', 'Strateji'], maxChoices: 2, allowChange: true, publicVotes: true, showResults: 'always', closesAt: null },
      subscribe: true,
    });
    const answers = [
      'GTA V, özellikle rol yapma sunucuları 😎',
      'Red Dead Redemption 2. Dünyası inanılmaz detaylı.',
      'Minecraft, çocukluğumdan beri bırakamadım.',
      'Elden Ring! Zor ama çok tatmin edici.',
      'Stardew Valley — kafa dinlemek için birebir.',
      'Counter-Strike 2, arkadaşlarla her akşam.',
      'Hollow Knight, müzikleri ayrı güzel.',
      'Cyberpunk 2077 güncellemelerden sonra harika oldu.',
      'Portal 2, bulmaca sevenler kaçırmasın.',
      'Hades, tekrar oynanabilirliği çok yüksek.',
      "Baldur's Gate 3, yılların en iyi RYO'su.",
      'Forza Horizon 5 ile araba sürmek terapi gibi.',
      'Euro Truck Simulator 2 😄',
      'League of Legends… maalesef 😅',
      'Rocket League, kısa maçlar için ideal.',
      'Terraria, arkadaşlarla bitmeyen macera.',
      'Skyrim, hâlâ modlarla oynuyorum.',
      'It Takes Two, eşimle bitirdik, harikaydı.',
    ];
    const order = ['Ayşe', 'Can', 'Zeynep', 'Moderatör Ali', 'Mehmet'];
    for (const [i, text] of answers.entries()) await posts.reply(as(order[i % order.length]!), t4.topicId, text);
  } finally {
    await settings.set('forum.floodSeconds', flood);
  }
  console.log('Örnek forum içeriği oluşturuldu.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
