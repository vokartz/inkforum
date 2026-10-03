// @ts-check
import { defineExtension, html } from '@inkforum/sdk';

const STATUS = { open: 'Açık', in_review: 'İnceleniyor', waiting_user: 'Yanıt bekleniyor', resolved: 'Çözüldü', rejected: 'Reddedildi' };
const ACTIVE = ['open', 'in_review', 'waiting_user'];
const PRIORITY = { low: 'Düşük', normal: 'Normal', high: 'Yüksek', urgent: 'Acil' };
const TARGET = { post: 'Mesaj', user: 'Üye', topic: 'Konu', other: 'Genel' };

const STATUS_HINT = {
  open: 'Şikayetin sırada; ekip en kısa sürede inceleyecek.',
  in_review: 'Ekip şikayetini inceliyor.',
  waiting_user: 'Ekip senden ek bilgi bekliyor. Aşağıdan yanıt verebilirsin.',
  resolved: 'Bu şikayet çözüldü olarak kapatıldı.',
  rejected: 'Bu şikayet incelendi ve reddedildi.',
};

const STATUS_NOTIFY = {
  open: 'Şikayetin yeniden açıldı',
  in_review: 'Şikayetin incelemeye alındı',
  waiting_user: 'Ekip, şikayetin için senden ek bilgi bekliyor',
  resolved: 'Şikayetin çözüldü',
  rejected: 'Şikayetin reddedildi',
};

const ACK = 'Şikayetin alındı, en kısa sürede incelenecek.';
const MEMBER_BASE = '/sikayetler';
const FORUM_STAFF = '/sikayetler/yonetim';
const ADMIN_BASE = '/admin/extensions/complaints/queue';
const PAGE_SIZE = 30;

export default defineExtension({
  migrations: {
    '001_init': {
      async up(db, s) {
        await s
          .table('ext_complaints_items')
          .addColumn('reporter_id', 'integer', s.notNull)
          .addColumn('target_type', 'text', s.textDefault('other'))
          .addColumn('target_id', 'bigint')
          .addColumn('target_user_id', 'integer')
          .addColumn('target_label', 'text', s.textDefault(''))
          .addColumn('category', 'text', s.notNull)
          .addColumn('subject', 'text', s.notNull)
          .addColumn('body', 'text', s.notNull)
          .addColumn('status', 'text', s.textDefault('open'))
          .addColumn('priority', 'text', s.textDefault('normal'))
          .addColumn('assignee_id', 'integer')
          .addColumn('created_at', 'bigint', s.notNull)
          .addColumn('updated_at', 'bigint', s.notNull)
          .execute();
        await db.schema.createIndex('ext_complaints_items_reporter').on('ext_complaints_items').columns(['reporter_id', 'updated_at']).execute();
        await db.schema.createIndex('ext_complaints_items_status').on('ext_complaints_items').columns(['status', 'updated_at']).execute();
        await db.schema.createIndex('ext_complaints_items_target_user').on('ext_complaints_items').columns(['target_user_id', 'status']).execute();

        await s
          .table('ext_complaints_messages')
          .addColumn('complaint_id', 'integer', s.ref('ext_complaints_items.id'))
          .addColumn('user_id', 'integer')
          .addColumn('body', 'text', s.notNull)
          .addColumn('kind', 'text', s.textDefault('message'))
          .addColumn('is_staff', 'smallint', s.flag(0))
          .addColumn('is_internal', 'smallint', s.flag(0))
          .addColumn('created_at', 'bigint', s.notNull)
          .execute();
        await db.schema.createIndex('ext_complaints_messages_complaint').on('ext_complaints_messages').columns(['complaint_id', 'created_at']).execute();
      },
    },
  },

  setup(ctx) {
    const I = ctx.table('items');
    const M = ctx.table('messages');

    const categories = () => {
      const list = String(ctx.settings.get('categories') ?? '')
        .split(/\r?\n/)
        .map((s) => s.trim().slice(0, 60))
        .filter(Boolean);
      return list.length ? [...new Set(list)].slice(0, 30) : ['Diğer'];
    };
    const maxOpen = () => Math.max(1, Math.min(50, Math.floor(Number(ctx.settings.get('maxOpen')) || 5)));
    const autoAck = () => {
      const v = ctx.settings.get('autoAck');
      return v === true || v === 1 || v === 'true' || v === '1';
    };

    /** @param {unknown} body @returns {Record<string, any>} */
    const bodyOf = (body) => (body && typeof body === 'object' && !Array.isArray(body) ? /** @type {Record<string, any>} */ (body) : {});

    /** @param {unknown} v @param {{ min?: number; max: number; field: string }} o */
    const text = (v, { min = 0, max, field }) => {
      const s = String(v ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim();
      if (s.length < min) throw ctx.http.error(422, min <= 1 ? `${field} boş olamaz.` : `${field} en az ${min} karakter olmalı.`);
      if (s.length > max) throw ctx.http.error(422, `${field} en fazla ${max} karakter olabilir.`);
      return s;
    };

    /** @param {unknown} v */
    const idOf = (v) => {
      const n = Number(v);
      if (!Number.isSafeInteger(n) || n <= 0) throw ctx.http.error(404, 'Şikayet bulunamadı.');
      return n;
    };

    /** @param {string | undefined} v */
    const queryId = (v) => (/^\d{1,12}$/.test(v ?? '') ? Number(v) : null);

    /** @param {unknown} v */
    const num = (v) => (v === null || v === undefined ? null : Number(v));
    /** @param {any} r */
    const norm = (r) =>
      r
        ? {
            ...r,
            id: Number(r.id),
            reporter_id: Number(r.reporter_id),
            target_id: num(r.target_id),
            target_user_id: num(r.target_user_id),
            assignee_id: num(r.assignee_id),
            created_at: Number(r.created_at),
            updated_at: Number(r.updated_at),
          }
        : null;

    const getItem = async (/** @type {number} */ id) =>
      norm(
        await ctx.db
          .selectFrom(`${I} as c`)
          .leftJoin('users as r', 'r.id', 'c.reporter_id')
          .leftJoin('users as a', 'a.id', 'c.assignee_id')
          .selectAll('c')
          .select(['r.username as reporter_username', 'r.display_name as reporter_name', 'a.username as assignee_username', 'a.display_name as assignee_name'])
          .where('c.id', '=', id)
          .executeTakeFirst(),
      );

    const thread = async (/** @type {number} */ id, /** @type {boolean} */ withInternal) => {
      let q = ctx.db
        .selectFrom(`${M} as m`)
        .leftJoin('users as u', 'u.id', 'm.user_id')
        .select(['m.id', 'm.user_id', 'm.body', 'm.kind', 'm.is_staff', 'm.is_internal', 'm.created_at', 'u.username', 'u.display_name'])
        .where('m.complaint_id', '=', id);
      if (!withInternal) q = q.where('m.is_internal', '=', 0);
      const rows = await q.orderBy('m.created_at', 'asc').orderBy('m.id', 'asc').limit(500).execute();
      return rows.map((m) => ({ ...m, id: Number(m.id), user_id: num(m.user_id), is_staff: Number(m.is_staff) === 1, is_internal: Number(m.is_internal) === 1, created_at: Number(m.created_at) }));
    };

    /**
     * @param {number} complaintId @param {number | null} userId @param {string} body
     * @param {{ staff?: boolean; internal?: boolean; kind?: 'message' | 'event' }} [o]
     */
    const addMessage = (complaintId, userId, body, o = {}) =>
      ctx.db
        .insertInto(M)
        .values({ complaint_id: complaintId, user_id: userId, body, kind: o.kind ?? 'message', is_staff: o.staff ? 1 : 0, is_internal: o.internal ? 1 : 0, created_at: Date.now() })
        .execute();

    const touch = (/** @type {number} */ id, /** @type {Record<string, unknown>} */ patch = {}) =>
      ctx.db
        .updateTable(I)
        .set({ ...patch, updated_at: Date.now() })
        .where('id', '=', id)
        .execute();

    const countActive = async (/** @type {number} */ userId) => {
      const r = await ctx.db.selectFrom(I).select((eb) => eb.fn.countAll().as('n')).where('reporter_id', '=', userId).where('status', 'in', ACTIVE).executeTakeFirst();
      return Number(r?.n ?? 0);
    };

    const resolvePost = async (/** @type {unknown} */ ref, /** @type {unknown} */ label, /** @type {number} */ uid) => {
      const pid = Number(ref);
      if (!Number.isSafeInteger(pid) || pid <= 0) throw ctx.http.error(422, 'Şikayet edilen mesaj bulunamadı.');
      const p = await ctx.db.selectFrom('posts').select(['id', 'user_id', 'deleted_at']).where('id', '=', pid).executeTakeFirst();
      if (!p || p.deleted_at != null) throw ctx.http.error(404, 'Şikayet edilen mesaj bulunamadı.');
      if (p.user_id != null && Number(p.user_id) === uid) throw ctx.http.error(422, 'Kendi mesajını şikayet edemezsin.');
      const lbl = String(label ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
      return { id: pid, userId: num(p.user_id), label: lbl || `Mesaj #${pid}` };
    };

    const resolveUser = async (/** @type {unknown} */ name, /** @type {number} */ uid) => {
      const n = String(name ?? '').trim().replace(/^@/, '');
      if (!n) throw ctx.http.error(422, 'Şikayet edilen üyenin kullanıcı adını yaz.');
      if (n.length > 60) throw ctx.http.error(422, 'Kullanıcı adı çok uzun.');
      const u = await ctx.forum.user(n);
      if (!u) throw ctx.http.error(404, `"${n}" adında bir üye bulunamadı.`);
      if (u.id === uid) throw ctx.http.error(422, 'Kendini şikayet edemezsin.');
      return { id: u.id, userId: u.id, label: `${u.displayName} (@${u.username})` };
    };

    const resolveTopic = async (/** @type {unknown} */ ref, /** @type {number} */ uid) => {
      const s = String(ref ?? '').trim();
      const m = s.match(/\/t\/(\d{1,15})/) ?? s.match(/^#?(\d{1,15})$/);
      if (!m) throw ctx.http.error(422, 'Konu bağlantısını ya da numarasını yaz (ör. /t/123).');
      const tid = Number(m[1]);
      const t = await ctx.db.selectFrom('topics').select(['id', 'user_id', 'deleted_at']).where('id', '=', tid).executeTakeFirst();
      if (!t || t.deleted_at != null) throw ctx.http.error(404, 'Konu bulunamadı.');
      if (t.user_id != null && Number(t.user_id) === uid) throw ctx.http.error(422, 'Kendi konunu şikayet edemezsin.');
      return { id: tid, userId: num(t.user_id), label: `Konu #${tid}` };
    };

    /**
     * Değişiklikleri yazar ve yazışmaya olay kaydı ekler. Çağıran ctx.tx içinde çalıştırır.
     * @param {any} c @param {{ status?: string; priority?: string; assignee_id?: number | null }} changes
     * @param {{ id: number; name: string }} actor @param {string | null} assigneeName
     */
    const writeChanges = async (c, changes, actor, assigneeName) => {
      await touch(c.id, changes);
      if (changes.status) await addMessage(c.id, actor.id, `${actor.name} durumu “${STATUS[changes.status]}” olarak değiştirdi.`, { staff: true, kind: 'event' });
      if (changes.priority) await addMessage(c.id, actor.id, `${actor.name} önceliği “${PRIORITY[changes.priority]}” yaptı.`, { staff: true, internal: true, kind: 'event' });
      if ('assignee_id' in changes) {
        const msg = changes.assignee_id
          ? changes.assignee_id === actor.id
            ? `${actor.name} şikayeti üstlendi.`
            : `${actor.name} şikayeti ${assigneeName ?? 'bir ekip üyesine'} atadı.`
          : `${actor.name} atamayı kaldırdı.`;
        await addMessage(c.id, actor.id, msg, { staff: true, internal: true, kind: 'event' });
      }
    };

    const afterChanges = async (/** @type {any} */ c, /** @type {{ status?: string; priority?: string; assignee_id?: number | null }} */ changes, /** @type {{ id: number; name: string }} */ actor, notifyReporter = true) => {
      if (changes.status) {
        await ctx.forum.audit('complaint.status', { id: c.id, from: c.status, to: changes.status }, actor.id);
        if (notifyReporter && c.reporter_id !== actor.id)
          await ctx.forum.notify(c.reporter_id, `${STATUS_NOTIFY[changes.status]} (#${c.id}: ${c.subject})`, { url: `${MEMBER_BASE}/${c.id}` });
      }
      if (changes.priority) await ctx.forum.audit('complaint.priority', { id: c.id, from: c.priority, to: changes.priority }, actor.id);
      if ('assignee_id' in changes) {
        await ctx.forum.audit('complaint.assign', { id: c.id, from: c.assignee_id, to: changes.assignee_id ?? null }, actor.id);
        if (changes.assignee_id && changes.assignee_id !== actor.id)
          await ctx.forum.notify(changes.assignee_id, `${actor.name} sana bir şikayet atadı (#${c.id}: ${c.subject})`, { url: `${FORUM_STAFF}?id=${c.id}` });
      }
    };

    const actorOf = (/** @type {import('@inkforum/sdk').ExtensionViewer} */ v) => ({ id: v.id, name: v.displayName ?? v.username ?? 'Ekip' });

    const pub = (/** @type {any} */ c) => ({
      id: c.id,
      subject: c.subject,
      category: c.category,
      body: c.body,
      status: c.status,
      statusLabel: STATUS[c.status] ?? c.status,
      targetType: c.target_type,
      targetId: c.target_id,
      targetLabel: c.target_label,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    });
    const staffJson = (/** @type {any} */ c) => ({
      ...pub(c),
      priority: c.priority,
      priorityLabel: PRIORITY[c.priority] ?? c.priority,
      targetUserId: c.target_user_id,
      reporter: { id: c.reporter_id, username: c.reporter_username ?? null, displayName: c.reporter_name ?? null },
      assignee: c.assignee_id ? { id: c.assignee_id, username: c.assignee_username ?? null, displayName: c.assignee_name ?? null } : null,
    });
    const msgJson = (/** @type {any} */ m) => ({
      id: m.id,
      kind: m.kind,
      body: m.body,
      isStaff: m.is_staff,
      isInternal: m.is_internal,
      user: m.user_id ? { id: m.user_id, username: m.username ?? null, displayName: m.display_name ?? null } : null,
      createdAt: m.created_at,
    });

    const rel = (/** @type {number} */ ms) => {
      const d = Date.now() - ms;
      if (d < 60_000) return 'az önce';
      if (d < 3_600_000) return `${Math.floor(d / 60_000)} dk önce`;
      if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} sa önce`;
      if (d < 7 * 86_400_000) return `${Math.floor(d / 86_400_000)} gün önce`;
      return new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    };
    const time = (/** @type {number} */ ms) => html`<time datetime="${new Date(ms).toISOString()}" title="${new Date(ms).toLocaleString('tr-TR')}">${rel(ms)}</time>`;
    const statusBadge = (/** @type {string} */ st) => html`<span class="cx-badge" data-status="${st}">${STATUS[st] ?? st}</span>`;
    const prioBadge = (/** @type {string} */ p) => html`<span class="cx-prio" data-priority="${p}">${PRIORITY[p] ?? p}</span>`;

    const qs = (/** @type {string} */ base, /** @type {Record<string, unknown>} */ params) => {
      const u = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) u.set(k, String(v));
      const s = u.toString();
      return s ? `${base}?${s}` : base;
    };

    const targetLink = (/** @type {any} */ c) => {
      if (c.target_type === 'post' && c.target_id) return html`<a href="/p/${c.target_id}">${c.target_label || `Mesaj #${c.target_id}`}</a>`;
      if (c.target_type === 'user' && c.target_id) return html`<a href="/u/${c.target_id}">${c.target_label}</a>`;
      if (c.target_type === 'topic' && c.target_id) return html`<a href="/t/${c.target_id}">${c.target_label}</a>`;
      return html`<span>Genel</span>`;
    };

    const firstEntry = (/** @type {any} */ c, /** @type {string} */ who) => html`
      <li class="cx-msg" data-role="reporter">
        <header><b>${who}</b> <span class="cx-tag">Şikayet</span> ${time(c.created_at)}</header>
        <div class="cx-msg-body">${c.body}</div>
      </li>`;

    const messageView = (/** @type {any} */ m, /** @type {number} */ viewerId) => {
      if (m.kind === 'event') return html`<li class="cx-event" data-internal="${m.is_internal ? '1' : '0'}"><span>${m.body}</span> · ${time(m.created_at)}${m.is_internal ? html` <span class="cx-tag cx-tag-note">Yalnızca ekip</span>` : ''}</li>`;
      const who = m.user_id ? (m.user_id === viewerId ? 'Sen' : (m.display_name ?? 'Silinmiş üye')) : 'Şikayet Merkezi';
      const role = m.is_internal ? 'note' : m.is_staff ? 'staff' : 'reporter';
      return html`
        <li class="cx-msg" data-role="${role}">
          <header>
            <b>${who}</b>
            ${m.is_staff && !m.is_internal ? html`<span class="cx-tag cx-tag-staff">${m.user_id ? 'Ekip' : 'Otomatik'}</span>` : ''}
            ${m.is_internal ? html`<span class="cx-tag cx-tag-note">İç not</span>` : ''}
            ${time(m.created_at)}
          </header>
          <div class="cx-msg-body">${m.body}</div>
        </li>`;
    };

    const options = (/** @type {Record<string, string>} */ map, /** @type {string} */ current) =>
      Object.entries(map).map(([k, label]) => html`<option value="${k}" ${k === current ? 'selected' : ''}>${label}</option>`);

    const excerpt = (/** @type {unknown} */ bb) =>
      String(bb ?? '')
        .replace(/\[\/?[a-z*][^\]]{0,200}\]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 600);

    const targetContext = async (/** @type {any} */ c) => {
      if (c.target_type === 'post' && c.target_id) {
        const p = await ctx.db
          .selectFrom('posts as p')
          .leftJoin('topics as t', 't.id', 'p.topic_id')
          .select(['p.id', 'p.author_name', 'p.body_bbcode', 'p.deleted_at', 'p.created_at', 't.id as topic_id', 't.title as topic_title'])
          .where('p.id', '=', c.target_id)
          .executeTakeFirst();
        if (!p) return html`<div class="cx-context"><b>Şikayet edilen mesaj</b><p class="cx-muted">Mesaj artık mevcut değil.</p></div>`;
        return html`
          <div class="cx-context">
            <div class="cx-context-head"><b>Şikayet edilen mesaj</b> <a href="/p/${p.id}">Mesaja git →</a></div>
            <p class="cx-meta">${p.author_name} · <a href="/t/${p.topic_id}">${p.topic_title ?? 'Konu'}</a> · ${time(Number(p.created_at))}${p.deleted_at != null ? html` · <span class="cx-tag cx-tag-note">Silinmiş</span>` : ''}</p>
            <blockquote>${excerpt(p.body_bbcode) || '—'}</blockquote>
          </div>`;
      }
      if (c.target_type === 'topic' && c.target_id) {
        const t = await ctx.db.selectFrom('topics').select(['id', 'title', 'author_name', 'reply_count', 'deleted_at', 'created_at']).where('id', '=', c.target_id).executeTakeFirst();
        if (!t) return html`<div class="cx-context"><b>Şikayet edilen konu</b><p class="cx-muted">Konu artık mevcut değil.</p></div>`;
        return html`
          <div class="cx-context">
            <div class="cx-context-head"><b>Şikayet edilen konu</b> <a href="/t/${t.id}">Konuya git →</a></div>
            <p><b>${t.title}</b></p>
            <p class="cx-meta">${t.author_name} · ${Number(t.reply_count)} yanıt · ${time(Number(t.created_at))}${t.deleted_at != null ? html` · <span class="cx-tag cx-tag-note">Silinmiş</span>` : ''}</p>
          </div>`;
      }
      if (c.target_type === 'user' && c.target_id) {
        const u = await ctx.forum.user(c.target_id);
        if (!u) return html`<div class="cx-context"><b>Şikayet edilen üye</b><p class="cx-muted">Üye artık mevcut değil.</p></div>`;
        return html`
          <div class="cx-context">
            <div class="cx-context-head"><b>Şikayet edilen üye</b> <a href="/u/${u.id}">Profile git →</a></div>
            <p><b>${u.displayName}</b> <span class="cx-muted">@${u.username}</span>${u.status !== 'active' ? html` <span class="cx-tag cx-tag-note">${u.status}</span>` : ''}</p>
            <p class="cx-meta">${u.postCount} mesaj · Katılım: ${new Date(u.createdAt).toLocaleDateString('tr-TR')}</p>
          </div>`;
      }
      return '';
    };

    const PRIORITY_ORDER = ctx.sql`case c.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`;
    const TABS = [['active', 'Aktif'], ['open', 'Açık'], ['in_review', 'İnceleniyor'], ['waiting_user', 'Yanıt bekleniyor'], ['resolved', 'Çözüldü'], ['rejected', 'Reddedildi'], ['all', 'Tümü']];

    /** @param {Record<string, string>} q @param {number} viewerId */
    const queueFilters = (q, viewerId) => {
      const status = q.status === 'all' || (q.status && q.status in STATUS) ? q.status : 'active';
      const mine = q.mine === '1';
      const userId = queryId(q.user);
      const page = Math.max(1, Math.min(1000, Math.floor(Number(q.page)) || 1));
      /** @param {any} query */
      const apply = (query) => {
        let x = query;
        if (mine) x = x.where('c.assignee_id', '=', viewerId);
        if (userId) x = x.where('c.target_user_id', '=', userId);
        return x;
      };
      return { status, mine, userId, page, apply };
    };

    /** @param {Record<string, string>} q @param {number} viewerId */
    const queueRows = async (q, viewerId) => {
      const f = queueFilters(q, viewerId);
      let list = f.apply(ctx.db.selectFrom(`${I} as c`).leftJoin('users as r', 'r.id', 'c.reporter_id').leftJoin('users as a', 'a.id', 'c.assignee_id'));
      if (f.status === 'active') list = list.where('c.status', 'in', ACTIVE);
      else if (f.status !== 'all') list = list.where('c.status', '=', f.status);
      list = list.selectAll('c').select(['r.username as reporter_username', 'r.display_name as reporter_name', 'a.username as assignee_username', 'a.display_name as assignee_name']);
      if (f.status === 'active' || ACTIVE.includes(f.status)) list = list.orderBy(PRIORITY_ORDER);
      const rows = (
        await list
          .orderBy('c.updated_at', 'desc')
          .orderBy('c.id', 'desc')
          .limit(PAGE_SIZE + 1)
          .offset((f.page - 1) * PAGE_SIZE)
          .execute()
      ).map(norm);
      const more = rows.length > PAGE_SIZE;
      return { f, rows: rows.slice(0, PAGE_SIZE), more };
    };

    /** @param {import('@inkforum/sdk').ExtensionRequest} req @param {string} base */
    const renderQueue = async (req, base) => {
      const { f, rows, more } = await queueRows(req.query, req.viewer.id);
      const countRows = await f.apply(ctx.db.selectFrom(`${I} as c`)).select(['c.status', (/** @type {any} */ eb) => eb.fn.countAll().as('n')]).groupBy('c.status').execute();
      /** @type {Record<string, number>} */
      const counts = Object.fromEntries(countRows.map((/** @type {any} */ r) => [r.status, Number(r.n)]));
      counts.active = ACTIVE.reduce((n, s) => n + (counts[s] ?? 0), 0);
      counts.all = Object.keys(STATUS).reduce((n, s) => n + (counts[s] ?? 0), 0);
      const targetUser = f.userId ? await ctx.forum.user(f.userId) : null;
      const keep = { status: f.status === 'active' ? '' : f.status, mine: f.mine ? '1' : '', user: f.userId ?? '' };

      return html`
        <div class="cx cx-queue">
          ${f.userId
            ? html`<p class="cx-notice">
                Yalnızca <a href="/u/${f.userId}"><b>${targetUser?.displayName ?? `Üye #${f.userId}`}</b></a> hakkındaki şikayetler gösteriliyor.
                <a href="${qs(base, { ...keep, user: '' })}">Filtreyi kaldır</a>
              </p>`
            : ''}
          <div class="cx-toolbar">
            <nav class="cx-tabs" aria-label="Durum">
              ${TABS.map(
                ([key, label]) =>
                  html`<a class="cx-tab" href="${qs(base, { ...keep, status: key === 'active' ? '' : key })}" ${key === f.status ? html`aria-current="page"` : ''}>${label} <span>${counts[key] ?? 0}</span></a>`,
              )}
            </nav>
            <a class="cx-chip" href="${qs(base, { ...keep, mine: f.mine ? '' : '1' })}" ${f.mine ? html`aria-current="page"` : ''}>${f.mine ? '✓ ' : ''}Bana atananlar</a>
          </div>
          ${rows.length
            ? html`
                <div class="cx-table-wrap">
                  <table class="cx-table">
                    <thead>
                      <tr><th>Şikayet</th><th>Şikayet eden</th><th>Kategori</th><th>Öncelik</th><th>Durum</th><th>Atanan</th><th>Güncelleme</th></tr>
                    </thead>
                    <tbody>
                      ${rows.map(
                        (c) => html`
                          <tr data-cx-href="${qs(base, { ...keep, id: c.id })}">
                            <td>
                              <a class="cx-subject" href="${qs(base, { ...keep, id: c.id })}">#${c.id} ${c.subject}</a>
                              <span class="cx-meta">${TARGET[c.target_type] ?? 'Genel'}${c.target_label ? `: ${c.target_label}` : ''}</span>
                            </td>
                            <td>${c.reporter_name ? html`<a href="/u/${c.reporter_id}">${c.reporter_name}</a>` : html`<span class="cx-muted">Silinmiş üye</span>`}</td>
                            <td>${c.category}</td>
                            <td>${prioBadge(c.priority)}</td>
                            <td>${statusBadge(c.status)}</td>
                            <td>${c.assignee_name ? (c.assignee_id === req.viewer.id ? html`<b>Sen</b>` : c.assignee_name) : html`<span class="cx-muted">—</span>`}</td>
                            <td>${time(c.updated_at)}</td>
                          </tr>`,
                      )}
                    </tbody>
                  </table>
                </div>
                ${f.page > 1 || more
                  ? html`<nav class="cx-pager">
                      ${f.page > 1 ? html`<a class="cx-btn cx-btn-ghost" href="${qs(base, { ...keep, page: f.page - 1 })}">← Önceki</a>` : ''}
                      <span class="cx-muted">Sayfa ${f.page}</span>
                      ${more ? html`<a class="cx-btn cx-btn-ghost" href="${qs(base, { ...keep, page: f.page + 1 })}">Sonraki →</a>` : ''}
                    </nav>`
                  : ''}
              `
            : html`<p class="cx-empty">Bu filtrede şikayet yok. 🎉</p>`}
        </div>`;
    };

    /** @param {import('@inkforum/sdk').ExtensionRequest} req @param {string} base @param {number} id */
    const renderStaffDetail = async (req, base, id) => {
      const c = await getItem(id);
      if (!c) return null;
      const [msgs, context, reporterTotal, targetOpen] = await Promise.all([
        thread(id, true),
        targetContext(c),
        ctx.db.selectFrom(I).select((eb) => eb.fn.countAll().as('n')).where('reporter_id', '=', c.reporter_id).executeTakeFirst(),
        c.target_user_id
          ? ctx.db.selectFrom(I).select((eb) => eb.fn.countAll().as('n')).where('target_user_id', '=', c.target_user_id).where('status', 'in', ACTIVE).executeTakeFirst()
          : Promise.resolve(null),
      ]);
      const back = qs(base, { status: req.query.status, mine: req.query.mine, user: req.query.user });
      const mine = c.assignee_id === req.viewer.id;
      const active = ACTIVE.includes(c.status);

      return {
        title: `#${c.id} · ${c.subject}`,
        html: html`
          <div class="cx cx-staff" data-cx-staff data-cx-id="${c.id}">
            <p><a class="cx-back" href="${back}">← Kuyruğa dön</a></p>
            <div class="cx-head">
              <p class="cx-meta">${c.category} · ${TARGET[c.target_type] ?? 'Genel'}: ${targetLink(c)} · Açılış ${time(c.created_at)}</p>
              <div class="cx-head-badges">${prioBadge(c.priority)} ${statusBadge(c.status)}</div>
            </div>
            <div class="cx-grid">
              <section class="cx-main">
                ${context}
                <ol class="cx-thread">
                  ${firstEntry(c, c.reporter_name ?? 'Silinmiş üye')}
                  ${msgs.map((m) => messageView(m, req.viewer.id))}
                </ol>
                <form class="cx-form cx-reply" data-cx-staff-reply>
                  <label>
                    <span data-cx-reply-label>Üyeye yanıt</span>
                    <textarea name="body" rows="4" required minlength="2" maxlength="4000" placeholder="Şikayet edene görünecek yanıtını yaz…"></textarea>
                  </label>
                  <div class="cx-row">
                    <label class="cx-check"><input type="checkbox" name="internal" value="1" /> İç not (yalnızca ekip görür)</label>
                    <label class="cx-inline">
                      Ardından durum
                      <select name="status">
                        <option value="">Değiştirme</option>
                        ${Object.entries(STATUS).map(([k, label]) => html`<option value="${k}">${label}</option>`)}
                      </select>
                    </label>
                  </div>
                  <div class="cx-actions">
                    <button type="submit" class="cx-btn" data-cx-submit>Yanıtla</button>
                    ${!c.assignee_id ? html`<span class="cx-muted">Yanıt verirsen şikayet sana atanır.</span>` : ''}
                  </div>
                  <output class="cx-out" data-cx-out></output>
                </form>
              </section>
              <aside class="cx-side">
                <div class="cx-box">
                  <h3>Yönetim</h3>
                  <label>Durum <select data-cx-field="status" data-cx-current="${c.status}">${options(STATUS, c.status)}</select></label>
                  <label>Öncelik <select data-cx-field="priority" data-cx-current="${c.priority}">${options(PRIORITY, c.priority)}</select></label>
                  <div class="cx-assign">
                    <span>Atanan: <b>${c.assignee_name ? (mine ? 'Sen' : c.assignee_name) : 'Kimse'}</b></span>
                    ${mine
                      ? html`<button type="button" class="cx-btn cx-btn-ghost" data-cx-act="unassign">Bırak</button>`
                      : html`<button type="button" class="cx-btn cx-btn-ghost" data-cx-act="assign-me">Üstlen</button>`}
                  </div>
                  <form class="cx-assign-form" data-cx-assign>
                    <input name="assignee" placeholder="Kullanıcı adı" maxlength="60" required autocomplete="off" />
                    <button type="submit" class="cx-btn cx-btn-ghost">Ata</button>
                  </form>
                  ${!active ? html`<p class="cx-muted">Şikayet kapalı. Durumu değiştirerek yeniden açabilirsin.</p>` : ''}
                </div>
                <div class="cx-box">
                  <h3>Ayrıntılar</h3>
                  <dl class="cx-dl">
                    <dt>Şikayet eden</dt>
                    <dd>${c.reporter_name ? html`<a href="/u/${c.reporter_id}">${c.reporter_name}</a>` : 'Silinmiş üye'} <span class="cx-muted">(${Number(reporterTotal?.n ?? 0)} şikayet)</span></dd>
                    <dt>Kategori</dt>
                    <dd>${c.category}</dd>
                    <dt>Hedef</dt>
                    <dd>${TARGET[c.target_type] ?? 'Genel'} · ${targetLink(c)}</dd>
                    ${targetOpen
                      ? html`<dt>Hedef hakkında</dt>
                          <dd><a href="${qs(base, { user: c.target_user_id })}">${Number(targetOpen.n)} açık şikayet</a></dd>`
                      : ''}
                    <dt>Açılış</dt>
                    <dd>${time(c.created_at)}</dd>
                    <dt>Son güncelleme</dt>
                    <dd>${time(c.updated_at)}</dd>
                  </dl>
                </div>
              </aside>
            </div>
          </div>`,
      };
    };

    /** @param {import('@inkforum/sdk').ExtensionRequest} req @param {string} base @param {boolean} inAdmin */
    const renderStaffPage = async (req, base, inAdmin) => {
      const styles = inAdmin ? ['style.css'] : undefined;
      const id = queryId(req.query.id);
      if (id) {
        const d = await renderStaffDetail(req, base, id);
        if (d) return { title: d.title, html: d.html, scripts: ['admin.js'], styles };
        if (!inAdmin) return { status: /** @type {404} */ (404) };
        return { html: html`<div class="cx"><p class="cx-empty">Şikayet bulunamadı. <a href="${base}">Kuyruğa dön</a></p></div>`, styles };
      }
      return { title: 'Şikayet kuyruğu', html: await renderQueue(req, base), scripts: ['admin.js'], styles };
    };

    /** @param {import('@inkforum/sdk').ExtensionRequest} req */
    const renderMemberList = async (req) => {
      const uid = req.viewer.id;
      const rows = (await ctx.db.selectFrom(I).selectAll().where('reporter_id', '=', uid).orderBy('updated_at', 'desc').limit(100).execute()).map(norm);
      const open = rows.filter((r) => ACTIVE.includes(r.status)).length;
      const limit = maxOpen();
      const prefillUser = String(req.query.uye ?? '').slice(0, 60);
      const prefillTopic = String(req.query.konu ?? '').slice(0, 200);
      const preType = prefillUser ? 'user' : prefillTopic ? 'topic' : 'other';

      return {
        title: 'Şikayet Merkezi',
        html: html`
          <div class="cx" data-cx-member>
            <p class="cx-lead">
              Kural ihlallerini, rahatsız edici davranışları ya da teknik sorunları buradan forum ekibine iletebilirsin. Şikayetlerin yalnızca sen ve yetkili ekip
              tarafından görülür.
            </p>
            ${req.viewer.can('handle') ? html`<p class="cx-notice"><a href="${FORUM_STAFF}"><b>Şikayet kuyruğunu aç</b></a> — ekip olarak gelen şikayetleri yönet.</p>` : ''}

            <div class="cx-section-head">
              <h2>Şikayetlerim</h2>
              <span class="cx-quota" data-full="${open >= limit ? '1' : '0'}"><b>${open}</b> / ${limit} açık</span>
            </div>
            ${rows.length
              ? html`<ul class="cx-list">
                  ${rows.map(
                    (r) => html`<li>
                      <a class="cx-item" href="${MEMBER_BASE}/${r.id}">
                        <span class="cx-item-main">
                          <b>#${r.id} ${r.subject}</b>
                          <span class="cx-meta">${r.category} · ${TARGET[r.target_type] ?? 'Genel'}${r.target_label ? `: ${r.target_label}` : ''} · ${time(r.updated_at)}</span>
                        </span>
                        ${statusBadge(r.status)}
                      </a>
                    </li>`,
                  )}
                </ul>`
              : html`<p class="cx-empty">Henüz bir şikayetin yok.</p>`}

            <h2 id="yeni">Yeni şikayet</h2>
            ${open >= limit
              ? html`<p class="cx-notice" data-tone="warning">Açık şikayet sınırına (${limit}) ulaştın. Yeni şikayet açmak için mevcut şikayetlerinin sonuçlanmasını bekle.</p>`
              : html`
                  <p class="cx-muted">Bir mesajı şikayet etmek için mesajın altındaki <b>Şikayet et</b> düğmesini kullanabilirsin.</p>
                  <form class="cx-form" data-cx-new>
                    <div class="cx-row">
                      <label>
                        Kategori
                        <select name="category" required>
                          ${categories().map((cat) => html`<option value="${cat}">${cat}</option>`)}
                        </select>
                      </label>
                      <label>
                        Şikayet edilen
                        <select name="targetType">
                          <option value="other" ${preType === 'other' ? 'selected' : ''}>Genel / belirli bir hedef yok</option>
                          <option value="user" ${preType === 'user' ? 'selected' : ''}>Bir üye</option>
                          <option value="topic" ${preType === 'topic' ? 'selected' : ''}>Bir konu</option>
                        </select>
                      </label>
                    </div>
                    <label data-cx-when="user">
                      Üyenin kullanıcı adı
                      <input name="targetUser" maxlength="60" placeholder="ornek_uye" autocomplete="off" value="${prefillUser}" />
                    </label>
                    <label data-cx-when="topic">
                      Konu bağlantısı ya da numarası
                      <input name="targetTopic" maxlength="200" placeholder="/t/123" autocomplete="off" value="${prefillTopic}" />
                    </label>
                    <label>
                      Başlık
                      <input name="subject" required minlength="4" maxlength="120" placeholder="Kısaca ne oldu?" />
                    </label>
                    <label>
                      Açıklama
                      <textarea name="body" rows="6" required minlength="10" maxlength="4000" placeholder="Ne olduğunu, ne zaman olduğunu ve varsa kanıt bağlantılarını yaz."></textarea>
                    </label>
                    <div class="cx-actions">
                      <button type="submit" class="cx-btn">Şikayeti gönder</button>
                    </div>
                    <output class="cx-out" data-cx-out></output>
                  </form>
                `}
          </div>`,
        scripts: ['panel.js'],
      };
    };

    /** @param {import('@inkforum/sdk').ExtensionRequest} req @param {number} id */
    const renderMemberDetail = async (req, id) => {
      const c = await getItem(id);
      if (!c || c.reporter_id !== req.viewer.id) {
        if (c && req.viewer.can('handle')) return { redirect: `${FORUM_STAFF}?id=${id}` };
        return { status: /** @type {404} */ (404) };
      }
      const msgs = await thread(id, false);
      const active = ACTIVE.includes(c.status);
      return {
        title: `#${c.id} · ${c.subject}`,
        html: html`
          <div class="cx" data-cx-member data-cx-id="${c.id}">
            <p><a class="cx-back" href="${MEMBER_BASE}">← Şikayetlerim</a></p>
            <div class="cx-head">
              <p class="cx-meta">${c.category} · ${TARGET[c.target_type] ?? 'Genel'}: ${targetLink(c)} · Açılış ${time(c.created_at)}</p>
              <div class="cx-head-badges">${statusBadge(c.status)}</div>
            </div>
            <p class="cx-notice" data-status="${c.status}">${STATUS_HINT[c.status] ?? ''}</p>
            <ol class="cx-thread">
              ${firstEntry(c, 'Sen')}
              ${msgs.map((m) => messageView(m, req.viewer.id))}
            </ol>
            ${active
              ? html`
                  <form class="cx-form cx-reply" data-cx-reply>
                    <label>
                      Yanıtın
                      <textarea name="body" rows="4" required minlength="2" maxlength="4000" placeholder="Ek bilgi ya da kanıt ekleyebilirsin…"></textarea>
                    </label>
                    <div class="cx-actions">
                      <button type="submit" class="cx-btn">Yanıt gönder</button>
                      <button type="button" class="cx-btn cx-btn-ghost" data-cx-close>Şikayeti kapat</button>
                    </div>
                    <output class="cx-out" data-cx-out></output>
                  </form>
                `
              : html`<p class="cx-empty">Bu şikayet kapatıldı. Yeni bir sorun için <a href="${MEMBER_BASE}#yeni">yeni şikayet</a> açabilirsin.</p>`}
          </div>`,
        scripts: ['panel.js'],
      };
    };

    ctx.pages.add({
      path: '/sikayetler/*',
      title: 'Şikayet Merkezi',
      layout: 'default',
      auth: true,
      permission: 'file',
      async render(req) {
        const rest = String(req.params.rest ?? '').replace(/^\/+|\/+$/g, '');
        if (rest === '') return renderMemberList(req);
        if (rest === 'yonetim') {
          if (!req.viewer.can('handle')) return { status: 403 };
          return renderStaffPage(req, FORUM_STAFF, false);
        }
        if (/^\d{1,12}$/.test(rest)) return renderMemberDetail(req, Number(rest));
        return { status: 404 };
      },
    });

    ctx.admin.page({
      key: 'queue',
      title: 'Şikayet kuyruğu',
      icon: 'tray',
      permission: 'handle',
      render: (req) => renderStaffPage(req, ADMIN_BASE, true),
    });

    ctx.account.page({
      key: 'complaints',
      title: 'Şikayetlerim',
      icon: 'flag',
      permission: 'file',
      async render(req) {
        const uid = req.viewer.id;
        const countRows = await ctx.db
          .selectFrom(I)
          .select(['status', (eb) => eb.fn.countAll().as('n')])
          .where('reporter_id', '=', uid)
          .groupBy('status')
          .execute();
        /** @type {Record<string, number>} */
        const counts = Object.fromEntries(countRows.map((r) => [r.status, Number(r.n)]));
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const recent = (await ctx.db.selectFrom(I).selectAll().where('reporter_id', '=', uid).orderBy('updated_at', 'desc').limit(5).execute()).map(norm);
        const waiting = counts.waiting_user ?? 0;
        return {
          html: html`
            <div class="cx">
              <p class="cx-lead">Toplam <b>${total}</b> şikayetin var. Ayrıntılar ve yeni şikayet için Şikayet Merkezi'ni kullan.</p>
              <div class="cx-stats">
                ${Object.keys(STATUS).map((s) => html`<div class="cx-stat" data-status="${s}"><b>${counts[s] ?? 0}</b><span>${STATUS[s]}</span></div>`)}
              </div>
              ${waiting ? html`<p class="cx-notice" data-tone="warning"><b>${waiting}</b> şikayetin için ekip senden yanıt bekliyor.</p>` : ''}
              ${recent.length
                ? html`<h3 class="cx-h3">Son güncellenenler</h3>
                    <ul class="cx-list">
                      ${recent.map(
                        (r) => html`<li>
                          <a class="cx-item" href="${MEMBER_BASE}/${r.id}">
                            <span class="cx-item-main"><b>#${r.id} ${r.subject}</b><span class="cx-meta">${r.category} · ${time(r.updated_at)}</span></span>
                            ${statusBadge(r.status)}
                          </a>
                        </li>`,
                      )}
                    </ul>`
                : ''}
              <div class="cx-actions">
                <a class="cx-btn" href="${MEMBER_BASE}">Şikayet Merkezi'ne git</a>
                <a class="cx-btn cx-btn-ghost" href="${MEMBER_BASE}#yeni">Yeni şikayet</a>
              </div>
            </div>`,
        };
      },
    });

    ctx.slots.add('postActions', {
      key: 'report',
      render(req) {
        if (req.viewer.isGuest || !req.post || !req.viewer.can('file')) return null;
        if (req.post.authorId != null && req.post.authorId === req.viewer.id) return null;
        const label = req.topic ? (req.post.isFirst ? req.topic.title : `${req.topic.title} · mesaj #${req.post.id}`) : `Mesaj #${req.post.id}`;
        return {
          html: html`
            <span class="cx-report" data-cx-report data-cx-post="${req.post.id}" data-cx-label="${label}">
              <button type="button" class="cx-report-btn" data-cx-open title="Bu mesajı ekibe şikayet et">
                <svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M42.76 50A8 8 0 0 0 40 56v168a8 8 0 0 0 16 0v-44.23c26.79-21.16 49.87-9.75 76.45 3.41 16.4 8.11 34.06 16.85 53 16.85 13.93 0 28.54-4.75 43.82-18a8 8 0 0 0 2.76-6V56a8 8 0 0 0-13.27-6c-28 24.23-51.72 12.49-79.21-1.12C111.07 34.76 78.78 18.79 42.76 50ZM216 172.25c-26.79 21.16-49.87 9.74-76.45-3.41-25-12.35-52.81-26.13-83.55-8.4V59.79c26.79-21.16 49.87-9.75 76.45 3.4 25 12.35 52.82 26.13 83.55 8.4Z"/></svg>
                <span data-cx-text>Şikayet et</span>
              </button>
              <dialog class="cx-dialog" aria-label="Mesajı şikayet et">
                <form class="cx-form" data-cx-report-form>
                  <h3>Mesajı şikayet et</h3>
                  <p class="cx-meta">${label}</p>
                  <label>
                    Kategori
                    <select name="category" required>
                      ${categories().map((cat) => html`<option value="${cat}">${cat}</option>`)}
                    </select>
                  </label>
                  <label>
                    Açıklama
                    <textarea name="body" rows="4" required minlength="10" maxlength="4000" placeholder="Bu mesajda sorun ne? Ekip yalnızca senin yazdıklarını görür."></textarea>
                  </label>
                  <output class="cx-out" data-cx-out></output>
                  <div class="cx-actions cx-actions-end">
                    <button type="button" class="cx-btn cx-btn-ghost" data-cx-cancel>Vazgeç</button>
                    <button type="submit" class="cx-btn">Gönder</button>
                  </div>
                </form>
              </dialog>
            </span>`,
          scripts: ['report.js'],
        };
      },
    });

    ctx.slots.add('profileSidebar', {
      key: 'staff-summary',
      title: 'Şikayet Merkezi',
      async render(req) {
        if (!req.profile || req.viewer.isGuest || !req.viewer.can('handle')) return null;
        const row = await ctx.db
          .selectFrom(I)
          .select((eb) => eb.fn.countAll().as('n'))
          .where('target_user_id', '=', req.profile.id)
          .where('status', 'in', ACTIVE)
          .executeTakeFirst();
        const n = Number(row?.n ?? 0);
        if (!n) return null;
        const base = req.viewer.can('admin.access') ? ADMIN_BASE : FORUM_STAFF;
        return html`
          <a class="cx-profile-card" href="${qs(base, { user: req.profile.id })}">
            <span class="cx-profile-n">${n}</span>
            <span>Bu üye hakkında <b>${n} açık şikayet</b> var.<br /><span class="cx-link">İncele →</span></span>
          </a>`;
      },
    });

    const MEMBER = { auth: true, permission: 'file' };

    const own = async (/** @type {import('@inkforum/sdk').ExtensionRequest} */ req) => {
      const c = await getItem(idOf(req.params.id));
      if (!c || c.reporter_id !== req.viewer.id) throw ctx.http.error(404, 'Şikayet bulunamadı.');
      return c;
    };

    ctx.routes.get(
      '/complaints',
      async (req) => {
        const rows = (await ctx.db.selectFrom(I).selectAll().where('reporter_id', '=', req.viewer.id).orderBy('updated_at', 'desc').limit(100).execute()).map(norm);
        return { items: rows.map(pub), open: rows.filter((r) => ACTIVE.includes(r.status)).length, maxOpen: maxOpen() };
      },
      MEMBER,
    );

    ctx.routes.post(
      '/complaints',
      async (req) => {
        const b = bodyOf(req.body);
        const uid = req.viewer.id;
        const category = String(b.category ?? '').trim();
        if (!categories().includes(category)) throw ctx.http.error(422, 'Geçerli bir kategori seç.');
        const targetType = typeof b.targetType === 'string' && b.targetType in TARGET ? b.targetType : 'other';

        /** @type {{ id: number | null; userId: number | null; label: string }} */
        let target = { id: null, userId: null, label: '' };
        if (targetType === 'post') target = await resolvePost(b.targetId, b.targetLabel, uid);
        else if (targetType === 'user') target = await resolveUser(b.targetUser, uid);
        else if (targetType === 'topic') target = await resolveTopic(b.targetTopic ?? b.targetId, uid);

        const fallbackSubject = targetType === 'post' ? `Mesaj şikayeti: ${target.label}`.slice(0, 120) : '';
        const subject = text(b.subject || fallbackSubject, { min: 4, max: 120, field: 'Başlık' });
        const body = text(b.body, { min: 10, max: 4000, field: 'Açıklama' });

        const limit = maxOpen();
        if ((await countActive(uid)) >= limit) throw ctx.http.error(409, `En fazla ${limit} açık şikayetin olabilir. Önce mevcut şikayetlerinin sonuçlanmasını bekle.`);
        if (target.id) {
          const dup = await ctx.db
            .selectFrom(I)
            .select('id')
            .where('reporter_id', '=', uid)
            .where('target_type', '=', targetType)
            .where('target_id', '=', target.id)
            .where('status', 'in', ACTIVE)
            .executeTakeFirst();
          if (dup) throw ctx.http.error(409, `Bunun için zaten açık bir şikayetin var (#${dup.id}).`);
        }

        const now = Date.now();
        const id = await ctx.tx(async () => {
          const row = await ctx.db
            .insertInto(I)
            .values({
              reporter_id: uid,
              target_type: targetType,
              target_id: target.id,
              target_user_id: target.userId,
              target_label: target.label,
              category,
              subject,
              body,
              status: 'open',
              priority: 'normal',
              assignee_id: null,
              created_at: now,
              updated_at: now,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          const cid = Number(row.id);
          if (autoAck()) await addMessage(cid, null, ACK, { staff: true });
          return cid;
        });
        ctx.log.info(`${req.viewer.username} yeni şikayet açtı: #${id} (${category})`);
        return ctx.http.json({ ok: true, id }, 201);
      },
      { ...MEMBER, rateLimit: { limit: 5, windowMs: 600_000, by: 'user' } },
    );

    ctx.routes.get(
      '/complaints/:id',
      async (req) => {
        const c = await own(req);
        return { complaint: pub(c), messages: (await thread(c.id, false)).map(msgJson) };
      },
      MEMBER,
    );

    ctx.routes.post(
      '/complaints/:id/reply',
      async (req) => {
        const c = await own(req);
        if (!ACTIVE.includes(c.status)) throw ctx.http.error(409, 'Bu şikayet kapatılmış; yanıt verilemez.');
        const body = text(bodyOf(req.body).body, { min: 2, max: 4000, field: 'Yanıt' });
        await ctx.tx(async () => {
          await addMessage(c.id, req.viewer.id, body);
          await touch(c.id, c.status === 'waiting_user' ? { status: c.assignee_id ? 'in_review' : 'open' } : {});
        });
        if (c.assignee_id && c.assignee_id !== req.viewer.id)
          await ctx.forum.notify(c.assignee_id, `${req.viewer.displayName ?? req.viewer.username} şikayetine yanıt yazdı (#${c.id}: ${c.subject})`, { url: `${FORUM_STAFF}?id=${c.id}` });
        return { ok: true };
      },
      { ...MEMBER, rateLimit: { limit: 20, windowMs: 600_000, by: 'user' } },
    );

    ctx.routes.post(
      '/complaints/:id/close',
      async (req) => {
        const c = await own(req);
        if (!ACTIVE.includes(c.status)) throw ctx.http.error(409, 'Şikayet zaten kapalı.');
        await ctx.tx(async () => {
          await touch(c.id, { status: 'resolved' });
          await addMessage(c.id, req.viewer.id, 'Şikayet, sahibi tarafından kapatıldı.', { kind: 'event' });
        });
        if (c.assignee_id && c.assignee_id !== req.viewer.id)
          await ctx.forum.notify(c.assignee_id, `${req.viewer.displayName ?? req.viewer.username} şikayetini kapattı (#${c.id}: ${c.subject})`, { url: `${FORUM_STAFF}?id=${c.id}` });
        return { ok: true };
      },
      MEMBER,
    );

    const STAFF = { auth: true, permission: 'handle' };

    const staffItem = async (/** @type {import('@inkforum/sdk').ExtensionRequest} */ req) => {
      const c = await getItem(idOf(req.params.id));
      if (!c) throw ctx.http.error(404, 'Şikayet bulunamadı.');
      return c;
    };

    ctx.routes.get(
      '/staff/complaints',
      async (req) => {
        const { f, rows, more } = await queueRows(req.query, req.viewer.id);
        return { items: rows.map(staffJson), page: f.page, more, status: f.status };
      },
      STAFF,
    );

    ctx.routes.get(
      '/staff/complaints/:id',
      async (req) => {
        const c = await staffItem(req);
        return { complaint: staffJson(c), messages: (await thread(c.id, true)).map(msgJson) };
      },
      STAFF,
    );

    ctx.routes.patch(
      '/staff/complaints/:id',
      async (req) => {
        const c = await staffItem(req);
        const b = bodyOf(req.body);
        /** @type {{ status?: string; priority?: string; assignee_id?: number | null }} */
        const changes = {};
        let assigneeName = null;

        if (b.status !== undefined) {
          if (typeof b.status !== 'string' || !(b.status in STATUS)) throw ctx.http.error(422, 'Geçersiz durum.');
          if (b.status !== c.status) changes.status = b.status;
        }
        if (b.priority !== undefined) {
          if (typeof b.priority !== 'string' || !(b.priority in PRIORITY)) throw ctx.http.error(422, 'Geçersiz öncelik.');
          if (b.priority !== c.priority) changes.priority = b.priority;
        }
        if (b.assignee !== undefined) {
          let aid = null;
          if (b.assignee === 'me') {
            aid = req.viewer.id;
            assigneeName = actorOf(req.viewer).name;
          } else if (b.assignee !== null && b.assignee !== '') {
            const u = await ctx.forum.user(String(b.assignee).trim().replace(/^@/, '').slice(0, 60));
            if (!u) throw ctx.http.error(404, 'Bu kullanıcı adıyla bir üye bulunamadı.');
            aid = u.id;
            assigneeName = u.displayName;
          }
          if (aid !== c.assignee_id) changes.assignee_id = aid;
        }
        if (!Object.keys(changes).length) return { ok: true, changed: false };

        const actor = actorOf(req.viewer);
        await ctx.tx(() => writeChanges(c, changes, actor, assigneeName));
        await afterChanges(c, changes, actor);
        return { ok: true, changed: true };
      },
      STAFF,
    );

    ctx.routes.post(
      '/staff/complaints/:id/messages',
      async (req) => {
        const c = await staffItem(req);
        const b = bodyOf(req.body);
        const internal = b.internal === true || b.internal === 1 || b.internal === '1' || b.internal === 'on';
        const body = text(b.body, { min: 2, max: 4000, field: internal ? 'Not' : 'Yanıt' });
        if (b.status !== undefined && b.status !== '' && (typeof b.status !== 'string' || !(b.status in STATUS))) throw ctx.http.error(422, 'Geçersiz durum.');

        const actor = actorOf(req.viewer);
        /** @type {{ status?: string; assignee_id?: number | null }} */
        const changes = {};
        if (b.status && b.status !== c.status) changes.status = b.status;
        if (!internal && !c.assignee_id) changes.assignee_id = actor.id;

        await ctx.tx(async () => {
          await addMessage(c.id, actor.id, body, { staff: true, internal });
          if (Object.keys(changes).length) await writeChanges(c, changes, actor, actor.name);
          else await touch(c.id);
        });
        await ctx.forum.audit(internal ? 'complaint.note' : 'complaint.reply', { id: c.id }, actor.id);
        await afterChanges(c, changes, actor, false);

        if (c.reporter_id !== actor.id) {
          if (!internal) {
            const extra = changes.status ? `; durum: ${STATUS[changes.status]}` : '';
            await ctx.forum.notify(c.reporter_id, `Şikayetine ekipten yanıt geldi${extra} (#${c.id}: ${c.subject})`, { url: `${MEMBER_BASE}/${c.id}` });
          } else if (changes.status) {
            await ctx.forum.notify(c.reporter_id, `${STATUS_NOTIFY[changes.status]} (#${c.id}: ${c.subject})`, { url: `${MEMBER_BASE}/${c.id}` });
          }
        }
        return ctx.http.json({ ok: true }, 201);
      },
      { ...STAFF, rateLimit: { limit: 30, windowMs: 60_000, by: 'user' } },
    );

    ctx.events.on('user.banned', async ({ userId }) => {
      const rows = await ctx.db.selectFrom(I).select(['id', 'reporter_id', 'subject']).where('target_user_id', '=', userId).where('status', 'in', ACTIVE).limit(500).execute();
      for (const r of rows) {
        const id = Number(r.id);
        await ctx.tx(async () => {
          await touch(id, { status: 'resolved' });
          await addMessage(id, null, 'Şikayet edilen üye yasaklandı; şikayet otomatik olarak çözüldü.', { staff: true, kind: 'event' });
        });
        await ctx.forum.notify(Number(r.reporter_id), `Şikayetin çözüldü: şikayet edilen üye yasaklandı (#${id}: ${r.subject})`, { url: `${MEMBER_BASE}/${id}` });
      }
      if (rows.length) ctx.log.info(`Üye #${userId} yasaklandı; ${rows.length} açık şikayet çözüldü.`);
    });
  },

  async uninstall(ctx) {
    await ctx.db.schema.dropTable('ext_complaints_messages').ifExists().execute();
    await ctx.db.schema.dropTable('ext_complaints_items').ifExists().execute();
  },
});
