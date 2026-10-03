import { Injectable } from '@nestjs/common';
import type { Locale, PendingPolicy, PolicySummary, PolicyVersionPublic } from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { CacheService } from '../cache/cache.service.js';
import { renderRichText } from '../common/rich-text.js';
import { bool } from '../database/json.js';
import { I18nService } from '../i18n/i18n.service.js';

const NS = 'policies';
const LOCALE = 'tr';

export interface PublishedVersion {
  policyId: number;
  key: string;
  isRequired: boolean;
  showOnRegister: boolean;
  sortOrder: number;
  versionId: number;
  version: number;
  title: string;
  bodyMd: string;
  changeNote: string | null;
  publishedAt: number;
  minAcceptedVersion: number;
}

@Injectable()
export class PoliciesService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly cache: CacheService,
    private readonly i18n: I18nService,
  ) {}

  private tx(locale: Locale | undefined, text: string): string {
    if (!locale || locale === 'tr' || !text) return text;
    return this.i18n.catalog(locale)?.[text] || text;
  }

  private localize<T extends { title: string; bodyMd?: string }>(p: T, locale?: Locale): T {
    if (!locale || locale === 'tr') return p;
    return { ...p, title: this.tx(locale, p.title), ...(p.bodyMd !== undefined ? { bodyMd: this.tx(locale, p.bodyMd) } : {}) };
  }

  async published(): Promise<PublishedVersion[]> {
    return this.cache.wrap(NS, 'published', async () => {
      const policies = await this.db.q
        .selectFrom('policies')
        .selectAll()
        .where('is_active', '=', 1)
        .orderBy('sort_order')
        .orderBy('id')
        .execute();
      const out: PublishedVersion[] = [];
      for (const p of policies) {
        const versions = await this.db.q
          .selectFrom('policy_versions')
          .innerJoin('policy_version_texts', 'policy_version_texts.policy_version_id', 'policy_versions.id')
          .select([
            'policy_versions.id',
            'policy_versions.version',
            'policy_versions.requires_reacceptance',
            'policy_versions.change_note',
            'policy_versions.published_at',
            'policy_version_texts.title',
            'policy_version_texts.body_md',
          ])
          .where('policy_versions.policy_id', '=', p.id)
          .where('policy_versions.published_at', 'is not', null)
          .where('policy_version_texts.locale', '=', LOCALE)
          .orderBy('policy_versions.version', 'desc')
          .execute();
        const latest = versions[0];
        if (!latest) continue;
        const minAccepted =
          versions.find((v) => bool(v.requires_reacceptance))?.version ?? versions[versions.length - 1]!.version;
        out.push({
          policyId: p.id,
          key: p.key,
          isRequired: bool(p.is_required),
          showOnRegister: bool(p.show_on_register),
          sortOrder: p.sort_order,
          versionId: latest.id,
          version: latest.version,
          title: latest.title,
          bodyMd: latest.body_md,
          changeNote: latest.change_note,
          publishedAt: latest.published_at!,
          minAcceptedVersion: minAccepted,
        });
      }
      return out;
    });
  }

  toPublic(p: PublishedVersion): PolicyVersionPublic {
    return {
      policyId: p.policyId,
      key: p.key,
      versionId: p.versionId,
      version: p.version,
      title: p.title,
      bodyMd: p.bodyMd,
      bodyHtml: renderRichText(p.bodyMd),
      isRequired: p.isRequired,
      publishedAt: p.publishedAt,
      changeNote: p.changeNote,
    };
  }

  async forRegistration(locale?: Locale): Promise<PublishedVersion[]> {
    return (await this.published()).filter((p) => p.showOnRegister).map((p) => this.localize(p, locale));
  }

  async list(locale?: Locale): Promise<PolicySummary[]> {
    return (await this.published()).map((p) => ({ key: p.key, title: this.tx(locale, p.title), version: p.version, publishedAt: p.publishedAt, isRequired: p.isRequired }));
  }

  async getByKey(key: string, userId?: number | null, locale?: Locale): Promise<PolicyVersionPublic> {
    const found = (await this.published()).find((x) => x.key === key);
    const p = found ? this.localize(found, locale) : undefined;
    if (!p) throw Errors.notFound('Politika bulunamadı.');
    const [versions, accepted] = await Promise.all([
      this.db.q
        .selectFrom('policy_versions')
        .select(['version', 'published_at', 'change_note', 'requires_reacceptance'])
        .where('policy_id', '=', p.policyId)
        .where('published_at', 'is not', null)
        .orderBy('version', 'desc')
        .limit(30)
        .execute(),
      userId
        ? this.db.q
            .selectFrom('policy_acceptances')
            .innerJoin('policy_versions', 'policy_versions.id', 'policy_acceptances.policy_version_id')
            .select(['policy_versions.version', 'policy_acceptances.accepted_at'])
            .where('policy_acceptances.user_id', '=', userId)
            .where('policy_versions.policy_id', '=', p.policyId)
            .orderBy('policy_versions.version', 'desc')
            .executeTakeFirst()
        : undefined,
    ]);
    return {
      ...this.toPublic(p),
      history: versions.map((v) => ({ version: v.version, publishedAt: v.published_at!, changeNote: v.change_note, requiresReacceptance: bool(v.requires_reacceptance) })),
      accepted: accepted ? { version: accepted.version, at: accepted.accepted_at } : null,
    };
  }

  async pendingFor(user: Row<'users'>, locale?: Locale): Promise<PendingPolicy[]> {
    const epoch = this.settings.get('policies.epoch');
    if (user.policies_epoch >= epoch) return [];
    const pending = (await this.computePending(user.id)).map((p) => this.localize(p, locale));
    if (!pending.length) {
      await this.db.q.updateTable('users').set({ policies_epoch: epoch }).where('id', '=', user.id).execute();
    }
    return pending;
  }

  private async computePending(userId: number): Promise<PendingPolicy[]> {
    const required = (await this.published()).filter((p) => p.isRequired);
    if (!required.length) return [];
    const accepted = await this.db.q
      .selectFrom('policy_acceptances')
      .innerJoin('policy_versions', 'policy_versions.id', 'policy_acceptances.policy_version_id')
      .select(['policy_versions.policy_id', (eb) => eb.fn.max('policy_versions.version').as('max_version')])
      .where('policy_acceptances.user_id', '=', userId)
      .groupBy('policy_versions.policy_id')
      .execute();
    const acceptedMap = new Map(accepted.map((a) => [a.policy_id, Number(a.max_version)]));
    return required
      .filter((p) => (acceptedMap.get(p.policyId) ?? 0) < p.minAcceptedVersion)
      .map((p) => ({
        policyId: p.policyId,
        key: p.key,
        versionId: p.versionId,
        version: p.version,
        title: p.title,
        changeNote: p.changeNote,
      }));
  }

  async validateRegistrationAcceptance(versionIds: number[]): Promise<PublishedVersion[]> {
    const policies = await this.forRegistration();
    const chosen = new Set(versionIds);
    const fields: Record<string, string> = {};
    for (const p of policies) {
      if (p.isRequired && !chosen.has(p.versionId)) fields[`policy_${p.key}`] = `"${p.title}" metnini kabul etmelisiniz.`;
    }
    if (Object.keys(fields).length) throw Errors.validation(fields);
    return policies.filter((p) => chosen.has(p.versionId));
  }

  async accept(userId: number, versionIds: number[], ip: string | null, userAgent: string | null): Promise<void> {
    const published = await this.published();
    const valid = new Set(published.map((p) => p.versionId));
    const now = this.clock.now();
    await this.db.tx(async () => {
      for (const versionId of versionIds) {
        if (!valid.has(versionId)) throw Errors.badRequest('Geçersiz veya güncel olmayan politika versiyonu.');
        await this.db.q
          .insertInto('policy_acceptances')
          .values({ user_id: userId, policy_version_id: versionId, accepted_at: now, ip, user_agent: userAgent })
          .onConflict((oc) => oc.columns(['user_id', 'policy_version_id']).doNothing())
          .execute();
      }
      const pending = await this.computePending(userId);
      if (!pending.length) {
        await this.db.q
          .updateTable('users')
          .set({ policies_epoch: this.settings.get('policies.epoch') })
          .where('id', '=', userId)
          .execute();
      }
    });
  }

  async acceptAllCurrent(userId: number, ip: string | null): Promise<void> {
    const versions = (await this.published()).map((p) => p.versionId);
    if (versions.length) await this.accept(userId, versions, ip, null);
  }

  async history(userId: number, locale?: Locale) {
    const rows = await this.db.q
      .selectFrom('policy_acceptances')
      .innerJoin('policy_versions', 'policy_versions.id', 'policy_acceptances.policy_version_id')
      .innerJoin('policies', 'policies.id', 'policy_versions.policy_id')
      .leftJoin('policy_version_texts', (j) =>
        j.onRef('policy_version_texts.policy_version_id', '=', 'policy_versions.id').on('policy_version_texts.locale', '=', LOCALE),
      )
      .select([
        'policy_acceptances.id',
        'policies.key',
        'policy_version_texts.title',
        'policy_versions.version',
        'policy_acceptances.accepted_at',
      ])
      .where('policy_acceptances.user_id', '=', userId)
      .orderBy('policy_acceptances.accepted_at', 'desc')
      .execute();
    return rows.map((r) => ({ ...r, title: r.title ? this.tx(locale, r.title) : r.title }));
  }

  async adminList() {
    const policies = await this.db.q.selectFrom('policies').selectAll().orderBy('sort_order').orderBy('id').execute();
    const versions = await this.db.q
      .selectFrom('policy_versions')
      .leftJoin('policy_version_texts', (j) =>
        j.onRef('policy_version_texts.policy_version_id', '=', 'policy_versions.id').on('policy_version_texts.locale', '=', LOCALE),
      )
      .select([
        'policy_versions.id',
        'policy_versions.policy_id',
        'policy_versions.version',
        'policy_versions.requires_reacceptance',
        'policy_versions.change_note',
        'policy_versions.published_at',
        'policy_versions.created_at',
        'policy_version_texts.title',
      ])
      .orderBy('policy_versions.version', 'desc')
      .execute();
    const counts = await this.db.q
      .selectFrom('policy_acceptances')
      .select(['policy_version_id', (eb) => eb.fn.countAll<number>().as('n')])
      .groupBy('policy_version_id')
      .execute();
    const countMap = new Map(counts.map((c) => [c.policy_version_id, Number(c.n)]));
    return policies.map((p) => ({
      id: p.id,
      key: p.key,
      isRequired: bool(p.is_required),
      showOnRegister: bool(p.show_on_register),
      isActive: bool(p.is_active),
      sortOrder: p.sort_order,
      versions: versions
        .filter((v) => v.policy_id === p.id)
        .map((v) => ({
          id: v.id,
          version: v.version,
          title: v.title ?? '',
          requiresReacceptance: bool(v.requires_reacceptance),
          changeNote: v.change_note,
          publishedAt: v.published_at,
          createdAt: v.created_at,
          acceptances: countMap.get(v.id) ?? 0,
        })),
    }));
  }

  async adminVersion(versionId: number) {
    const v = await this.db.q
      .selectFrom('policy_versions')
      .innerJoin('policies', 'policies.id', 'policy_versions.policy_id')
      .leftJoin('policy_version_texts', (j) =>
        j.onRef('policy_version_texts.policy_version_id', '=', 'policy_versions.id').on('policy_version_texts.locale', '=', LOCALE),
      )
      .select([
        'policy_versions.id',
        'policy_versions.policy_id',
        'policies.key',
        'policy_versions.version',
        'policy_versions.requires_reacceptance',
        'policy_versions.change_note',
        'policy_versions.published_at',
        'policy_version_texts.title',
        'policy_version_texts.body_md',
      ])
      .where('policy_versions.id', '=', versionId)
      .executeTakeFirst();
    if (!v) throw Errors.notFound('Versiyon bulunamadı.');
    return {
      id: v.id,
      policyId: v.policy_id,
      key: v.key,
      version: v.version,
      requiresReacceptance: bool(v.requires_reacceptance),
      changeNote: v.change_note,
      publishedAt: v.published_at,
      title: v.title ?? '',
      bodyMd: v.body_md ?? '',
      bodyHtml: renderRichText(v.body_md ?? ''),
    };
  }

  async createPolicy(input: { key: string; isRequired: boolean; showOnRegister: boolean; sortOrder: number; title: string; bodyMd: string }) {
    const now = this.clock.now();
    const exists = await this.db.q.selectFrom('policies').select('id').where('key', '=', input.key).executeTakeFirst();
    if (exists) throw Errors.conflict('Bu anahtarla bir politika zaten var.', { key: 'Bu anahtar kullanılıyor.' });
    return this.db.tx(async () => {
      const p = await this.db.q
        .insertInto('policies')
        .values({
          key: input.key,
          is_required: input.isRequired,
          show_on_register: input.showOnRegister,
          sort_order: input.sortOrder,
          created_at: now,
          updated_at: now,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await this.createVersion(p.id, { title: input.title, bodyMd: input.bodyMd, requiresReacceptance: true, changeNote: null }, null);
      await this.invalidate();
      return p.id;
    });
  }

  async updatePolicy(id: number, patch: { isRequired?: boolean; showOnRegister?: boolean; isActive?: boolean; sortOrder?: number }) {
    const p = await this.db.q.selectFrom('policies').selectAll().where('id', '=', id).executeTakeFirst();
    if (!p) throw Errors.notFound('Politika bulunamadı.');
    await this.db.tx(async () => {
      await this.db.q
        .updateTable('policies')
        .set({
          ...(patch.isRequired !== undefined ? { is_required: patch.isRequired } : {}),
          ...(patch.showOnRegister !== undefined ? { show_on_register: patch.showOnRegister } : {}),
          ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
          ...(patch.sortOrder !== undefined ? { sort_order: patch.sortOrder } : {}),
          updated_at: this.clock.now(),
        })
        .where('id', '=', id)
        .execute();
      if (patch.isRequired === true && !bool(p.is_required)) await this.bumpEpoch();
      await this.invalidate();
    });
  }

  async createVersion(
    policyId: number,
    input: { title: string; bodyMd: string; requiresReacceptance: boolean; changeNote: string | null },
    actorId: number | null,
  ): Promise<number> {
    const now = this.clock.now();
    return this.db.tx(async () => {
      const draft = await this.db.q
        .selectFrom('policy_versions')
        .select('id')
        .where('policy_id', '=', policyId)
        .where('published_at', 'is', null)
        .executeTakeFirst();
      if (draft) throw Errors.conflict('Bu politikanın yayımlanmamış bir taslağı zaten var; önce onu düzenleyin veya silin.');
      const last = await this.db.q
        .selectFrom('policy_versions')
        .select((eb) => eb.fn.max('version').as('v'))
        .where('policy_id', '=', policyId)
        .executeTakeFirst();
      const v = await this.db.q
        .insertInto('policy_versions')
        .values({
          policy_id: policyId,
          version: Number(last?.v ?? 0) + 1,
          requires_reacceptance: input.requiresReacceptance,
          change_note: input.changeNote,
          created_by: actorId,
          created_at: now,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await this.db.q
        .insertInto('policy_version_texts')
        .values({ policy_version_id: v.id, locale: LOCALE, title: input.title, body_md: input.bodyMd })
        .execute();
      return v.id;
    });
  }

  async updateDraft(versionId: number, input: { title: string; bodyMd: string; requiresReacceptance: boolean; changeNote: string | null }) {
    const v = await this.db.q.selectFrom('policy_versions').selectAll().where('id', '=', versionId).executeTakeFirst();
    if (!v) throw Errors.notFound('Versiyon bulunamadı.');
    if (v.published_at) throw Errors.badRequest('Yayımlanmış versiyonlar değiştirilemez; yeni bir versiyon oluşturun.');
    await this.db.tx(async () => {
      await this.db.q
        .updateTable('policy_versions')
        .set({ requires_reacceptance: input.requiresReacceptance, change_note: input.changeNote })
        .where('id', '=', versionId)
        .execute();
      await this.db.q
        .updateTable('policy_version_texts')
        .set({ title: input.title, body_md: input.bodyMd })
        .where('policy_version_id', '=', versionId)
        .where('locale', '=', LOCALE)
        .execute();
    });
  }

  async deleteDraft(versionId: number) {
    const v = await this.db.q.selectFrom('policy_versions').selectAll().where('id', '=', versionId).executeTakeFirst();
    if (!v) throw Errors.notFound('Versiyon bulunamadı.');
    if (v.published_at) throw Errors.badRequest('Yayımlanmış versiyonlar silinemez.');
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('policy_version_texts').where('policy_version_id', '=', versionId).execute();
      await this.db.q.deleteFrom('policy_versions').where('id', '=', versionId).execute();
    });
  }

  async publish(versionId: number): Promise<{ reacceptance: boolean }> {
    const v = await this.db.q.selectFrom('policy_versions').selectAll().where('id', '=', versionId).executeTakeFirst();
    if (!v) throw Errors.notFound('Versiyon bulunamadı.');
    if (v.published_at) throw Errors.badRequest('Bu versiyon zaten yayımlanmış.');
    const policy = await this.db.q.selectFrom('policies').selectAll().where('id', '=', v.policy_id).executeTakeFirstOrThrow();
    const previous = await this.db.q
      .selectFrom('policy_versions')
      .select('id')
      .where('policy_id', '=', v.policy_id)
      .where('published_at', 'is not', null)
      .executeTakeFirst();
    const reacceptance = bool(policy.is_required) && (bool(v.requires_reacceptance) || !previous);
    await this.db.tx(async () => {
      await this.db.q.updateTable('policy_versions').set({ published_at: this.clock.now() }).where('id', '=', versionId).execute();
      if (reacceptance) await this.bumpEpoch();
      await this.invalidate();
    });
    return { reacceptance };
  }

  private async bumpEpoch(): Promise<void> {
    await this.settings.set('policies.epoch', this.settings.get('policies.epoch') + 1);
  }

  async invalidate(): Promise<void> {
    await this.cache.invalidate(NS);
  }
}
