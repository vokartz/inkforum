import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@forum/shared';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { CryptoService } from '../security/crypto.service.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { EventsService } from '../events/events.service.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../security/totp.js';

const RECOVERY_CODE_COUNT = 10;

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly crypto: CryptoService,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
  ) {}

  async isEnabled(userId: number): Promise<boolean> {
    const row = await this.db.q.selectFrom('user_totp').select('enabled_at').where('user_id', '=', userId).executeTakeFirst();
    return !!row?.enabled_at;
  }

  /** Yeni (henüz etkin olmayan) gizli anahtar üretir. */
  async beginSetup(userId: number, account: string): Promise<{ secret: string; otpauthUrl: string }> {
    if (await this.isEnabled(userId)) throw Errors.badRequest('İki adımlı doğrulama zaten etkin.');
    const secret = generateTotpSecret();
    const now = this.clock.now();
    await this.db.q
      .insertInto('user_totp')
      .values({ user_id: userId, secret_enc: this.crypto.encrypt(secret), enabled_at: null, last_used_step: null, created_at: now })
      .onConflict((oc) => oc.column('user_id').doUpdateSet({ secret_enc: this.crypto.encrypt(secret), enabled_at: null, last_used_step: null, created_at: now }))
      .execute();
    return { secret, otpauthUrl: otpauthUrl(secret, account, this.settings.get('general.forumName')) };
  }

  /** Kurulumu doğrular, etkinleştirir ve kurtarma kodlarını döner (yalnızca bir kez gösterilir). */
  async confirmSetup(userId: number, code: string): Promise<string[]> {
    const row = await this.db.q.selectFrom('user_totp').selectAll().where('user_id', '=', userId).executeTakeFirst();
    if (!row) throw Errors.badRequest('Önce kurulumu başlatın.');
    if (row.enabled_at) throw Errors.badRequest('İki adımlı doğrulama zaten etkin.');
    const step = verifyTotp(this.crypto.decrypt(row.secret_enc), code, this.clock.now());
    if (step === null) throw Errors.code(ErrorCode.TWO_FACTOR_INVALID, 'Kod hatalı. Uygulamadaki güncel kodu girin.', 422);
    return this.db.tx(async () => {
      await this.db.q
        .updateTable('user_totp')
        .set({ enabled_at: this.clock.now(), last_used_step: step })
        .where('user_id', '=', userId)
        .execute();
      const codes = await this.regenerateCodesInner(userId);
      this.events.emit('user.twoFactorChanged', { userId, enabled: true });
      return codes;
    });
  }

  async disable(userId: number): Promise<void> {
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('user_totp').where('user_id', '=', userId).execute();
      await this.db.q.deleteFrom('user_recovery_codes').where('user_id', '=', userId).execute();
    });
    this.events.emit('user.twoFactorChanged', { userId, enabled: false });
  }

  async regenerateCodes(userId: number): Promise<string[]> {
    if (!(await this.isEnabled(userId))) throw Errors.badRequest('İki adımlı doğrulama etkin değil.');
    return this.db.tx(() => this.regenerateCodesInner(userId));
  }

  private async regenerateCodesInner(userId: number): Promise<string[]> {
    const now = this.clock.now();
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => this.crypto.recoveryCode());
    await this.db.q.deleteFrom('user_recovery_codes').where('user_id', '=', userId).execute();
    await this.db.q
      .insertInto('user_recovery_codes')
      .values(codes.map((c) => ({ user_id: userId, code_hash: this.crypto.sha256(c), created_at: now })))
      .execute();
    return codes;
  }

  async remainingCodes(userId: number): Promise<number> {
    const r = await this.db.q
      .selectFrom('user_recovery_codes')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('user_id', '=', userId)
      .where('used_at', 'is', null)
      .executeTakeFirst();
    return Number(r?.n ?? 0);
  }

  /** TOTP kodu veya kurtarma kodu doğrular. Aynı TOTP kodu iki kez kabul edilmez. */
  async verify(userId: number, code: string): Promise<boolean> {
    const row = await this.db.q.selectFrom('user_totp').selectAll().where('user_id', '=', userId).executeTakeFirst();
    if (!row?.enabled_at) return false;
    const clean = code.trim().toLowerCase();

    if (/^\d{6}$/.test(clean)) {
      const step = verifyTotp(this.crypto.decrypt(row.secret_enc), clean, this.clock.now());
      if (step === null || (row.last_used_step !== null && step <= row.last_used_step)) return false;
      const r = await this.db.q
        .updateTable('user_totp')
        .set({ last_used_step: step })
        .where('user_id', '=', userId)
        .where((eb) => eb.or([eb('last_used_step', 'is', null), eb('last_used_step', '<', step)]))
        .executeTakeFirst();
      return Number(r.numUpdatedRows) === 1;
    }

    const normalized = clean.replace(/[^a-z0-9]/g, '');
    if (normalized.length !== 10) return false;
    const formatted = `${normalized.slice(0, 5)}-${normalized.slice(5)}`;
    const r = await this.db.q
      .updateTable('user_recovery_codes')
      .set({ used_at: this.clock.now() })
      .where('user_id', '=', userId)
      .where('code_hash', '=', this.crypto.sha256(formatted))
      .where('used_at', 'is', null)
      .executeTakeFirst();
    return Number(r.numUpdatedRows) === 1;
  }
}
