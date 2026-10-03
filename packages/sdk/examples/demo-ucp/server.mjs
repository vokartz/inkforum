// @ts-check
import { defineExtension, html } from '@inkforum/sdk';

const STATUS = { pending: 'Bekliyor', approved: 'Onaylandı', rejected: 'Reddedildi' };

export default defineExtension({
  migrations: {
    '001_characters': {
      async up(db, s) {
        await s
          .table('ext_demo_ucp_characters')
          .addColumn('user_id', 'integer', s.notNull)
          .addColumn('name', 'text', s.notNull)
          .addColumn('story', 'text', s.textDefault(''))
          .addColumn('status', 'text', s.textDefault('pending'))
          .addColumn('created_at', 'bigint', s.notNull)
          .execute();
        await db.schema.createIndex('ext_demo_ucp_characters_user').on('ext_demo_ucp_characters').column('user_id').execute();
      },
    },
  },

  setup(ctx) {
    const T = 'ext_demo_ucp_characters';
    const mine = (userId) => ctx.db.selectFrom(T).selectAll().where('user_id', '=', userId).orderBy('created_at', 'desc').execute();
    const badge = (st) => html`<span class="demo-ucp-badge" data-status="${st}">${STATUS[st] ?? st}</span>`;

    ctx.pages.add({
      path: '/oyun',
      title: 'Oyun Paneli',
      auth: true,
      permission: 'view',
      async render(req) {
        const chars = await mine(req.viewer.id);
        return {
          title: `${ctx.settings.get('serverName')} · Oyun Paneli`,
          html: html`
            <p>Merhaba <b>${req.viewer.displayName}</b>, karakterlerini buradan yönetebilirsin.</p>
            <h2>Karakterlerim</h2>
            <ul class="demo-ucp-list" data-list>
              ${chars.length ? chars.map((c) => html`<li><b>${c.name}</b> ${badge(c.status)}</li>`) : html`<li class="demo-ucp-empty">Henüz karakterin yok.</li>`}
            </ul>
            <h2>Karakter başvurusu</h2>
            <form class="demo-ucp-form" data-form>
              <label>Karakter adı <input name="name" required maxlength="40" placeholder="Ali Yılmaz" /></label>
              <label>Hikâye <textarea name="story" rows="4" maxlength="2000"></textarea></label>
              <button type="submit">Başvur</button>
              <output data-out></output>
            </form>`,
          scripts: ['panel.js'],
          data: { max: ctx.settings.get('maxCharacters'), count: chars.length },
        };
      },
    });

    ctx.routes.get('/characters', async (req) => mine(req.viewer.id), { auth: true, permission: 'view' });

    ctx.routes.post(
      '/characters',
      async (req) => {
        const body = /** @type {{ name?: string; story?: string }} */ (req.body ?? {});
        const name = String(body.name ?? '').trim();
        if (name.length < 3) throw ctx.http.error(422, 'Karakter adı en az 3 karakter olmalı.');
        const count = (await mine(req.viewer.id)).length;
        if (count >= Number(ctx.settings.get('maxCharacters'))) throw ctx.http.error(409, 'Karakter sınırına ulaştın.');
        await ctx.db.insertInto(T).values({ user_id: req.viewer.id, name, story: String(body.story ?? '').slice(0, 2000), created_at: Date.now() }).execute();
        ctx.log.info(`${req.viewer.username} yeni karakter başvurusu yaptı: ${name}`);
        return ctx.http.json({ ok: true }, 201);
      },
      { auth: true, permission: 'view', rateLimit: { limit: 10, windowMs: 600_000, by: 'user' } },
    );

    ctx.routes.post(
      '/characters/:id/:decision',
      async (req) => {
        const id = Number(req.params.id);
        const decision = req.params.decision === 'approve' ? 'approved' : req.params.decision === 'reject' ? 'rejected' : null;
        if (!decision) throw ctx.http.error(404, 'Bilinmeyen işlem.');
        const row = await ctx.db.selectFrom(T).selectAll().where('id', '=', id).executeTakeFirst();
        if (!row) throw ctx.http.error(404, 'Başvuru bulunamadı.');
        await ctx.db.updateTable(T).set({ status: decision }).where('id', '=', id).execute();
        if (decision === 'approved') for (const g of ctx.settings.get('playerGroup') ?? []) await ctx.forum.addToGroup(row.user_id, g);
        await ctx.forum.notify(row.user_id, `"${row.name}" karakter başvurun ${decision === 'approved' ? 'onaylandı' : 'reddedildi'}.`, { url: '/oyun' });
        await ctx.forum.audit(`character.${decision}`, { id, name: row.name }, req.viewer.id);
        return { ok: true };
      },
      { permission: 'review' },
    );

    ctx.admin.page({
      key: 'applications',
      title: 'Karakter başvuruları',
      icon: 'clipboard-text',
      permission: 'review',
      async render() {
        const rows = await ctx.db
          .selectFrom(T)
          .innerJoin('users', 'users.id', `${T}.user_id`)
          .select([`${T}.id`, `${T}.name`, `${T}.story`, `${T}.status`, `${T}.created_at`, 'users.username'])
          .orderBy(`${T}.created_at`, 'desc')
          .limit(200)
          .execute();
        return {
          html: html`
            <div class="demo-ucp-admin">
              ${rows.length
                ? rows.map(
                    (r) => html`<article data-id="${r.id}">
                      <header><b>${r.name}</b> <span>@${r.username}</span> ${badge(r.status)}</header>
                      <p>${r.story || '—'}</p>
                      ${r.status === 'pending' ? html`<div><button data-act="approve">Onayla</button> <button data-act="reject">Reddet</button></div>` : ''}
                    </article>`,
                  )
                : html`<p>Henüz başvuru yok.</p>`}
            </div>`,
          scripts: ['admin.js'],
          styles: ['style.css'],
        };
      },
    });

    ctx.slots.add('profileTab', {
      title: 'Karakterler',
      async render(req) {
        if (!req.profile) return null;
        const chars = (await mine(req.profile.id)).filter((c) => c.status === 'approved');
        if (!chars.length) return null;
        return html`<ul class="demo-ucp-list">${chars.map((c) => html`<li><b>${c.name}</b></li>`)}</ul>`;
      },
    });

    ctx.slots.add('homeSidebar', {
      title: 'Oyun sunucusu',
      async render() {
        const row = await ctx.db.selectFrom(T).select((eb) => eb.fn.countAll().as('n')).where('status', '=', 'approved').executeTakeFirst();
        return html`<p class="demo-ucp-server"><b>${ctx.settings.get('serverName')}</b><br />${Number(row?.n ?? 0)} onaylı karakter · <a href="/oyun">Oyun paneli</a></p>`;
      },
    });

    ctx.events.on('user.registered', async ({ userId }) => {
      await ctx.forum.notify(userId, `${ctx.settings.get('serverName')} sunucusuna hoş geldin! İlk karakterini Oyun Paneli'nden oluşturabilirsin.`, { url: '/oyun' });
    });
  },

  async uninstall(ctx) {
    await ctx.db.schema.dropTable('ext_demo_ucp_characters').ifExists().execute();
  },
});
