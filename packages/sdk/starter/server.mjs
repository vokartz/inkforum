// @ts-check
import { defineExtension, html } from '@inkforum/sdk';

export default defineExtension({
  migrations: {
    '001_init': {
      async up(db, s) {
        await s.table('ext___TABLE___visits').addColumn('user_id', 'integer').addColumn('created_at', 'bigint', s.notNull).execute();
      },
    },
  },

  setup(ctx) {
    const visits = ctx.table('visits');
    const count = async () => Number((await ctx.db.selectFrom(visits).select((eb) => eb.fn.countAll().as('n')).executeTakeFirst())?.n ?? 0);

    ctx.pages.add({
      path: '/__ID__',
      title: '__NAME__',
      permission: 'view',
      async render(req) {
        await ctx.db.insertInto(visits).values({ user_id: req.viewer.id || null, created_at: Date.now() }).execute();
        return {
          html: html`
            <p>${ctx.settings.get('greeting')}, <b>${req.viewer.displayName ?? 'misafir'}</b>!</p>
            <p>Bu sayfa ${await count()} kez açıldı.</p>
            <button type="button" data-ping>Sunucuya sor</button>
            <output data-out></output>`,
          scripts: ['page.js'],
          data: { id: req.viewer.id },
        };
      },
    });

    ctx.routes.get('/ping', (req) => ({ pong: true, user: req.viewer.username, at: Date.now() }));

    ctx.admin.page({
      key: 'stats',
      title: 'İstatistikler',
      icon: 'chart-bar',
      async render() {
        return { html: html`<p>Toplam ziyaret: <b>${await count()}</b></p>` };
      },
    });

    ctx.events.on('topic.created', ({ topicId }) => ctx.log.info(`Yeni konu: ${topicId}`));
  },

  async uninstall(ctx) {
    await ctx.db.schema.dropTable('ext___TABLE___visits').ifExists().execute();
  },
});
