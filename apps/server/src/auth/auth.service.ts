import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import {
  ErrorCode,
  ageOn,
  canonicalName,
  displayNameIssue,
  isoDate,
  passwordIssue,
  usernameIssue,
  type LoginResult,
  type RegisterResult,
} from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock, HOUR, MINUTE } from '../common/clock.js';
import { revokeUserTokens } from './revoke-tokens.js';
import { AppError, Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import { PasswordHasher } from '../security/password-hasher.js';
import { RateLimitService } from '../security/rate-limit.service.js';
import { CryptoService } from '../security/crypto.service.js';
import { SessionService } from './session.service.js';
import { TokensService } from './tokens.service.js';
import { TwoFactorService } from './two-factor.service.js';
import { PoliciesService } from '../policies/policies.service.js';
import { BansService } from '../bans/bans.service.js';
import { MailService } from '../mail/mail.service.js';
import { AuditService } from '../audit/audit.service.js';
import { EventsService } from '../events/events.service.js';
import { ProfileFieldsService } from '../profiles/profile-fields.service.js';
import type { RequestViewer } from '../common/request-context.js';

export interface RegisterData {
  username: string;
  displayName: string;
  email: string;
  password: string;
  birthdate: string;
  acceptedPolicyVersionIds: number[];
  customFields: Record<string, string>;
  website: string;
  formStartedAt?: number;
}

interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

const LOGIN_IP_LIMIT = 30;
const LOGIN_IP_WINDOW = 15 * MINUTE;
const CHALLENGE_TTL = 5 * MINUTE;
const CHALLENGE_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  private dummyHash: string | null = null;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly hasher: PasswordHasher,
    private readonly rateLimit: RateLimitService,
    private readonly crypto: CryptoService,
    private readonly sessions: SessionService,
    private readonly tokens: TokensService,
    private readonly twoFactor: TwoFactorService,
    private readonly policies: PoliciesService,
    private readonly bans: BansService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly profileFields: ProfileFieldsService,
  ) {}

  passwordRules() {
    return {
      minLength: this.settings.get('security.passwordMinLength'),
      requireMixed: this.settings.get('security.passwordRequireMixed'),
    };
  }

  checkPassword(password: string, username?: string, field = 'password'): void {
    const issue = passwordIssue(password, this.passwordRules(), username);
    if (issue) throw Errors.field(field, issue);
  }

  isReservedName(name: string): boolean {
    const c = canonicalName(name);
    const contains = this.settings.get('registration.reservedNamesContains');
    return this.settings.get('registration.reservedNames').some((r) => {
      const rc = canonicalName(r);
      return rc && (contains ? c.includes(rc) : c === rc);
    });
  }

  async validateNames(username: string, displayName: string, excludeUserId?: number, checkReserved = true) {
    const fields: Record<string, string> = {};
    const rules = {
      minLength: this.settings.get('registration.usernameMinLength'),
      maxLength: this.settings.get('registration.usernameMaxLength'),
    };
    const uIssue = usernameIssue(username, rules);
    if (uIssue) fields.username = uIssue;
    else if (checkReserved && this.isReservedName(username)) fields.username = 'Bu kullanıcı adı kullanılamaz.';
    else if (await this.users.isNameTaken(username, excludeUserId)) fields.username = 'Bu kullanıcı adı alınmış.';

    if (canonicalName(displayName) !== canonicalName(username)) {
      const dIssue = displayNameIssue(displayName);
      if (dIssue) fields.displayName = dIssue;
      else if (checkReserved && this.isReservedName(displayName)) fields.displayName = 'Bu görünen ad kullanılamaz.';
      else if (await this.users.isNameTaken(displayName, excludeUserId)) fields.displayName = 'Bu görünen ad kullanılıyor.';
    }
    return fields;
  }

  async register(data: RegisterData, client: ClientInfo, res: Response): Promise<RegisterResult> {
    const mode = this.settings.get('registration.mode');
    if (mode === 'closed') throw Errors.code(ErrorCode.REGISTRATION_CLOSED, 'Yeni üye kayıtları şu anda kapalı.', 403);

    if (data.website) throw Errors.badRequest('Kayıt tamamlanamadı.');
    const minSeconds = this.settings.get('registration.minSubmitSeconds');
    if (minSeconds > 0 && data.formStartedAt && this.clock.now() - data.formStartedAt < minSeconds * 1000) {
      throw Errors.badRequest('Form çok hızlı gönderildi. Lütfen birkaç saniye bekleyip tekrar deneyin.');
    }
    if ((await this.rateLimit.failures('register', { ip: client.ip }, HOUR)) >= 10) throw Errors.rateLimited(3600);

    const username = data.username.trim().replace(/\s+/g, ' ');
    const displayName = (data.displayName || username).trim().replace(/\s+/g, ' ');
    const fields: Record<string, string> = await this.validateNames(username, displayName);

    if (await this.users.isEmailTaken(data.email)) fields.email = 'Bu e-posta adresiyle kayıtlı bir hesap var.';

    const pwIssue = passwordIssue(data.password, this.passwordRules(), username);
    if (pwIssue) fields.password = pwIssue;

    let birthdate: string | null = null;
    if (data.birthdate) {
      const parsed = isoDate.safeParse(data.birthdate);
      if (!parsed.success) fields.birthdate = 'Geçerli bir doğum tarihi girin.';
      else {
        birthdate = parsed.data;
        const age = ageOn(birthdate, this.clock.date());
        const minAge = this.settings.get('registration.minAge');
        if (age < 0 || age > 120) fields.birthdate = 'Geçerli bir doğum tarihi girin.';
        else if (minAge > 0 && age < minAge) fields.birthdate = `Kayıt olabilmek için en az ${minAge} yaşında olmalısınız.`;
      }
    } else if (this.settings.get('registration.requireBirthdate')) {
      fields.birthdate = 'Doğum tarihi gerekli.';
    }

    let customValues = new Map<number, string>();
    try {
      customValues = this.profileFields.validateAll(await this.profileFields.forRegistration(), data.customFields);
    } catch (err) {
      if (err instanceof AppError && err.fields) Object.assign(fields, err.fields);
      else throw err;
    }

    try {
      await this.policies.validateRegistrationAcceptance(data.acceptedPolicyVersionIds);
    } catch (err) {
      if (err instanceof AppError && err.fields) Object.assign(fields, err.fields);
      else throw err;
    }

    if (Object.keys(fields).length) {
      await this.rateLimit.record('register', canonicalName(username), client.ip, false);
      throw Errors.validation(fields);
    }

    const ban = await this.bans.check('register', { ip: client.ip, email: data.email, username });
    if (ban) throw Errors.code(ErrorCode.BANNED, ban.reason ?? 'Bu bilgilerle kayıt olmanız engellenmiş.', 403);

    const passwordHash = await this.hasher.hash(data.password);
    const status = mode === 'open' ? 'active' : mode === 'approval' ? 'pending_approval' : 'pending_email';

    const user = await this.db.tx(async () => {
      const created = await this.users.create({
        username,
        displayName,
        email: data.email,
        passwordHash,
        status,
        emailVerifiedAt: null,
        ip: client.ip,
        birthdate,
      });
      await this.profileFields.saveValues(created.id, customValues);
      if (data.acceptedPolicyVersionIds.length) {
        await this.policies.accept(created.id, data.acceptedPolicyVersionIds, client.ip, client.userAgent);
      }
      if (status === 'pending_email') {
        await this.sendVerification(created, client.ip, mode === 'email_approval');
      }
      await this.rateLimit.record('register', canonicalName(username), client.ip, true);
      await this.audit.log({
        type: 'user',
        action: 'user.register',
        actorId: created.id,
        targetType: 'user',
        targetId: created.id,
        ip: client.ip,
        userAgent: client.userAgent,
        data: { status },
      });
      this.events.emit('user.registered', { userId: created.id });
      if (status === 'active') this.events.emit('user.activated', { userId: created.id });
      return created;
    });

    if (status === 'active') {
      const { token } = await this.sessions.create(user.id, false, client.ip, client.userAgent);
      this.sessions.setCookie(res, token, false);
      await this.users.update(user.id, { last_login_at: this.clock.now() });
      await this.sendWelcome(user);
    }
    return { status, userId: user.id };
  }

  async sendWelcome(user: Pick<Row<'users'>, 'email' | 'display_name' | 'locale'>): Promise<void> {
    if (!this.settings.get('email.welcome')) return;
    await this.mail.send(user.email, await this.mail.compose('welcome', { name: user.display_name, url: this.mail.url('/') }, user.locale));
  }

  private async sendVerification(user: Row<'users'>, ip: string | null, thenApprove: boolean): Promise<void> {
    const hours = this.settings.get('email.verifyTokenHours');
    const token = await this.tokens.create(user.id, 'email_verify', hours * HOUR, ip, { thenApprove });
    await this.mail.send(
      user.email,
      await this.mail.compose('verifyEmail', {
        name: user.display_name,
        url: this.mail.url(`/verify-email/${token}`),
        hours,
      }, user.locale),
    );
  }

  async verifyEmail(token: string, client: ClientInfo, res: Response): Promise<{ status: 'active' | 'pending_approval' }> {
    const result = await this.db.tx(async () => {
      const { row, payload } = await this.tokens.consume<{ thenApprove?: boolean }>('email_verify', token);
      const user = await this.users.findById(row.user_id);
      if (!user) throw Errors.code(ErrorCode.TOKEN_INVALID, 'Bu bağlantı geçersiz.', 400);
      const now = this.clock.now();
      let status = user.status;
      if (user.status === 'pending_email') status = payload?.thenApprove ? 'pending_approval' : 'active';
      await this.users.update(user.id, { email_verified_at: user.email_verified_at ?? now, status });
      await this.audit.log({ type: 'user', action: 'user.email_verified', actorId: user.id, targetType: 'user', targetId: user.id, ip: client.ip });
      this.events.emit('user.emailVerified', { userId: user.id });
      if (status === 'active' && user.status !== 'active') this.events.emit('user.activated', { userId: user.id });
      return { user, status };
    });

    if (result.status === 'active') {
      const { token: sessionToken } = await this.sessions.create(result.user.id, false, client.ip, client.userAgent);
      this.sessions.setCookie(res, sessionToken, false);
      await this.users.update(result.user.id, { last_login_at: this.clock.now() });
      if (result.user.status !== 'active') await this.sendWelcome(result.user);
      return { status: 'active' };
    }
    return { status: 'pending_approval' };
  }

  async resendVerification(email: string, client: ClientInfo): Promise<void> {
    const key = email.trim().toLowerCase();
    if ((await this.rateLimit.failures('verify_resend', { identifier: key }, HOUR)) >= 3) throw Errors.rateLimited(3600);
    await this.rateLimit.record('verify_resend', key, client.ip, false);
    const user = await this.users.findByEmail(email);
    if (!user || user.status !== 'pending_email') return;
    const mode = this.settings.get('registration.mode');
    await this.db.tx(() => this.sendVerification(user, client.ip, mode === 'email_approval' || mode === 'approval'));
  }

  private lockoutWindow(): number {
    return this.settings.get('security.loginLockoutMinutes') * MINUTE;
  }

  async login(identifier: string, password: string, remember: boolean, client: ClientInfo, res: Response): Promise<LoginResult> {
    const ident = identifier.includes('@') ? identifier.trim().toLowerCase() : canonicalName(identifier);
    if ((await this.rateLimit.failures('login', { ip: client.ip }, LOGIN_IP_WINDOW)) >= LOGIN_IP_LIMIT) {
      throw Errors.rateLimited(Math.ceil(LOGIN_IP_WINDOW / 1000));
    }
    const maxAttempts = this.settings.get('security.loginMaxAttempts');
    if ((await this.rateLimit.failuresSinceSuccess('login', ident, this.lockoutWindow())) >= maxAttempts) {
      throw Errors.code(
        ErrorCode.ACCOUNT_LOCKED,
        `Çok fazla hatalı deneme. Lütfen ${this.settings.get('security.loginLockoutMinutes')} dakika sonra tekrar deneyin.`,
        429,
      );
    }

    const user = await this.users.findByIdentifier(identifier);
    const ok = user ? await this.hasher.verify(user.password_hash, password) : await this.fakeVerify(password);
    if (!user || !ok) {
      await this.rateLimit.record('login', ident, client.ip, false);
      if (user) {
        await this.audit.log({ type: 'security', action: 'login.failed', targetType: 'user', targetId: user.id, ip: client.ip, userAgent: client.userAgent });
      }
      throw Errors.code(ErrorCode.INVALID_CREDENTIALS, 'Kullanıcı adı/e-posta veya şifre hatalı.', 401);
    }

    this.assertCanLogin(user);
    const ban = await this.bans.check('login', { userId: user.id, ip: client.ip, email: user.email, username: user.username });
    if (ban) {
      throw Errors.code(ErrorCode.BANNED, ban.reason ?? 'Hesabınız yasaklanmış.', 403, { expiresAt: ban.expiresAt });
    }

    await this.rateLimit.record('login', ident, client.ip, true);
    if (await this.hasher.needsRehash(user.password_hash)) {
      await this.users.update(user.id, { password_hash: await this.hasher.hash(password) });
    }

    if (await this.twoFactor.isEnabled(user.id)) {
      const challenge = this.crypto.token(24);
      await this.db.q
        .insertInto('login_challenges')
        .values({
          token_hash: this.crypto.sha256(challenge),
          user_id: user.id,
          is_persistent: remember,
          expires_at: this.clock.now() + CHALLENGE_TTL,
          created_at: this.clock.now(),
          ip: client.ip,
        })
        .execute();
      return { status: 'two_factor_required', challenge };
    }

    await this.completeLogin(user, remember, client, res);
    return { status: 'ok' };
  }

  async loginTwoFactor(challenge: string, code: string, client: ClientInfo, res: Response): Promise<LoginResult> {
    const row = await this.db.q
      .selectFrom('login_challenges')
      .selectAll()
      .where('token_hash', '=', this.crypto.sha256(challenge))
      .executeTakeFirst();
    if (!row || row.expires_at <= this.clock.now() || row.attempts >= CHALLENGE_MAX_ATTEMPTS) {
      throw Errors.code(ErrorCode.TOKEN_INVALID, 'Doğrulama süresi doldu. Lütfen yeniden giriş yapın.', 400);
    }
    if ((await this.rateLimit.failuresSinceSuccess('2fa', String(row.user_id), 15 * MINUTE)) >= 10) {
      throw Errors.code(ErrorCode.RATE_LIMITED, 'Çok fazla hatalı doğrulama kodu girildi. 15 dakika sonra yeniden deneyin.', 429);
    }
    const valid = await this.twoFactor.verify(row.user_id, code);
    if (!valid) {
      await this.db.q
        .updateTable('login_challenges')
        .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
        .where('id', '=', row.id)
        .execute();
      await this.rateLimit.record('2fa', String(row.user_id), client.ip, false);
      throw Errors.code(ErrorCode.TWO_FACTOR_INVALID, 'Doğrulama kodu hatalı.', 422);
    }
    await this.db.q.deleteFrom('login_challenges').where('id', '=', row.id).execute();
    await this.rateLimit.record('2fa', String(row.user_id), client.ip, true);
    const user = await this.users.findById(row.user_id);
    if (!user) throw Errors.code(ErrorCode.TOKEN_INVALID, 'Hesap bulunamadı.', 400);
    this.assertCanLogin(user);
    await this.completeLogin(user, row.is_persistent === 1, client, res);
    return { status: 'ok' };
  }

  async loginExternal(user: Row<'users'>, client: ClientInfo, res: Response): Promise<LoginResult> {
    this.assertCanLogin(user);
    const ban = await this.bans.check('login', { userId: user.id, ip: client.ip, email: user.email, username: user.username });
    if (ban) throw Errors.code(ErrorCode.BANNED, ban.reason ?? 'Hesabınız yasaklanmış.', 403, { expiresAt: ban.expiresAt });
    if (await this.twoFactor.isEnabled(user.id)) {
      const challenge = this.crypto.token(24);
      await this.db.q
        .insertInto('login_challenges')
        .values({ token_hash: this.crypto.sha256(challenge), user_id: user.id, is_persistent: true, expires_at: this.clock.now() + CHALLENGE_TTL, created_at: this.clock.now(), ip: client.ip })
        .execute();
      return { status: 'two_factor_required', challenge };
    }
    await this.completeLogin(user, true, client, res);
    return { status: 'ok' };
  }

  async registerExternal(
    data: { username: string; email: string; emailVerified: boolean; acceptedPolicyVersionIds: number[] },
    client: ClientInfo,
    res: Response,
  ): Promise<{ status: Row<'users'>['status']; userId: number }> {
    const mode = this.settings.get('registration.mode');
    if (mode === 'closed') throw Errors.code(ErrorCode.REGISTRATION_CLOSED, 'Yeni üye kayıtları şu anda kapalı.', 403);
    const username = data.username.trim().replace(/\s+/g, ' ');
    const fields: Record<string, string> = await this.validateNames(username, username);
    if (await this.users.isEmailTaken(data.email)) fields.email = 'Bu e-posta adresiyle kayıtlı bir hesap var. Giriş yapıp ayarlardan hesabını bağlayabilirsin.';
    try {
      await this.policies.validateRegistrationAcceptance(data.acceptedPolicyVersionIds);
    } catch (err) {
      if (err instanceof AppError && err.fields) Object.assign(fields, err.fields);
      else throw err;
    }
    if (Object.keys(fields).length) throw Errors.validation(fields);
    const ban = await this.bans.check('register', { ip: client.ip, email: data.email, username });
    if (ban) throw Errors.code(ErrorCode.BANNED, ban.reason ?? 'Bu bilgilerle kayıt olmanız engellenmiş.', 403);

    const passwordHash = `!external:${this.crypto.token(24)}`;
    const verified = data.emailVerified;
    const status = mode === 'approval' ? 'pending_approval' : mode === 'open' || verified ? 'active' : 'pending_email';
    const user = await this.db.tx(async () => {
      const created = await this.users.create({ username, displayName: username, email: data.email, passwordHash, status, emailVerifiedAt: verified ? this.clock.now() : null, ip: client.ip });
      if (data.acceptedPolicyVersionIds.length) await this.policies.accept(created.id, data.acceptedPolicyVersionIds, client.ip, client.userAgent);
      if (status === 'pending_email') await this.sendVerification(created, client.ip, false);
      await this.audit.log({ type: 'user', action: 'user.register', actorId: created.id, targetType: 'user', targetId: created.id, ip: client.ip, userAgent: client.userAgent, data: { status, external: true } });
      this.events.emit('user.registered', { userId: created.id });
      if (status === 'active') this.events.emit('user.activated', { userId: created.id });
      return created;
    });
    if (status === 'active') {
      await this.completeLogin(user, true, client, res);
      await this.sendWelcome(user);
    }
    return { status, userId: user.id };
  }

  private assertCanLogin(user: Row<'users'>): void {
    if (user.status === 'pending_email') {
      throw Errors.code(ErrorCode.ACCOUNT_PENDING_EMAIL, 'Giriş yapmadan önce e-posta adresinizi doğrulamalısınız.', 403, {
        email: user.email,
      });
    }
    if (user.status === 'pending_approval') {
      throw Errors.code(ErrorCode.ACCOUNT_PENDING_APPROVAL, 'Üyeliğiniz henüz yöneticiler tarafından onaylanmadı.', 403);
    }
    if (user.status === 'deactivated') {
      throw Errors.code(ErrorCode.ACCOUNT_DEACTIVATED, 'Bu hesap devre dışı bırakılmış.', 403);
    }
  }

  private async completeLogin(user: Row<'users'>, remember: boolean, client: ClientInfo, res: Response): Promise<void> {
    const { token } = await this.sessions.create(user.id, remember, client.ip, client.userAgent);
    this.sessions.setCookie(res, token, remember);
    await this.users.update(user.id, { last_login_at: this.clock.now(), last_ip: client.ip });
    await this.audit.log({ type: 'security', action: 'login', actorId: user.id, targetType: 'user', targetId: user.id, ip: client.ip, userAgent: client.userAgent });
    this.events.emit('user.loggedIn', { userId: user.id });
  }

  private async fakeVerify(password: string): Promise<false> {
    this.dummyHash ??= await this.hasher.hash('forum-dummy-password');
    await this.hasher.verify(this.dummyHash, password);
    return false;
  }

  async logout(viewer: RequestViewer, res: Response): Promise<void> {
    if (viewer.session) await this.sessions.revoke(viewer.session.id);
    this.sessions.clearCookie(res);
  }

  async forgotPassword(email: string, client: ClientInfo): Promise<void> {
    const key = email.trim().toLowerCase();
    if ((await this.rateLimit.failures('reset', { identifier: key }, HOUR)) >= 3) return;
    if ((await this.rateLimit.failures('reset', { ip: client.ip }, HOUR)) >= 10) throw Errors.rateLimited(3600);
    await this.rateLimit.record('reset', key, client.ip, false);
    const user = await this.users.findByEmail(email);
    if (!user || user.status === 'deactivated') return;
    const minutes = this.settings.get('email.resetTokenMinutes');
    await this.db.tx(async () => {
      const token = await this.tokens.create(user.id, 'password_reset', minutes * MINUTE, client.ip);
      await this.mail.send(
        user.email,
        await this.mail.compose('passwordReset', {
          name: user.display_name,
          url: this.mail.url(`/reset-password/${token}`),
          minutes,
        }, user.locale),
      );
      await this.audit.log({ type: 'security', action: 'password.reset_requested', targetType: 'user', targetId: user.id, ip: client.ip });
    });
  }

  async checkResetToken(token: string): Promise<boolean> {
    return !!(await this.tokens.peek('password_reset', token));
  }

  async resetPassword(token: string, password: string, client: ClientInfo): Promise<void> {
    const peek = await this.tokens.peek('password_reset', token);
    if (!peek) throw Errors.code(ErrorCode.TOKEN_INVALID, 'Bu bağlantı geçersiz veya süresi dolmuş.', 400);
    const user = await this.users.findById(peek.user_id);
    if (!user) throw Errors.code(ErrorCode.TOKEN_INVALID, 'Bu bağlantı geçersiz.', 400);
    this.checkPassword(password, user.username);
    const hash = await this.hasher.hash(password);
    await this.db.tx(async () => {
      await this.tokens.consume('password_reset', token);
      const now = this.clock.now();
      const mode = this.settings.get('registration.mode');
      const status = user.status === 'pending_email' ? (mode === 'email_approval' ? 'pending_approval' : 'active') : user.status;
      await this.users.update(user.id, {
        password_hash: hash,
        must_change_password: false,
        email_verified_at: user.email_verified_at ?? now,
        status,
      });
      await this.sessions.revokeAll(user.id);
      await revokeUserTokens(this.db, user.id, now);
      await this.mail.send(user.email, await this.mail.compose('passwordChanged', { name: user.display_name }, user.locale));
      await this.audit.log({ type: 'security', action: 'password.reset', actorId: user.id, targetType: 'user', targetId: user.id, ip: client.ip });
      if (status === 'active' && user.status === 'pending_email') this.events.emit('user.activated', { userId: user.id });
    });
  }

  async changePassword(viewer: RequestViewer, current: string, next: string): Promise<void> {
    const user = viewer.user!;
    const forced = user.must_change_password === 1;
    if ((!forced || current) && !user.password_hash.startsWith('!external')) {
      if (!current || !(await this.hasher.verify(user.password_hash, current))) {
        throw Errors.field('currentPassword', 'Mevcut şifreniz hatalı.');
      }
    }
    this.checkPassword(next, user.username, 'newPassword');
    if (await this.hasher.verify(user.password_hash, next)) {
      throw Errors.field('newPassword', 'Yeni şifre mevcut şifrenizle aynı olamaz.');
    }
    const hash = await this.hasher.hash(next);
    await this.db.tx(async () => {
      await this.users.update(user.id, { password_hash: hash, must_change_password: false });
      await this.sessions.revokeAll(user.id, viewer.session?.id);
      await revokeUserTokens(this.db, user.id, this.clock.now());
      await this.mail.send(user.email, await this.mail.compose('passwordChanged', { name: user.display_name }, user.locale));
      await this.audit.log({ type: 'security', action: 'password.changed', actorId: user.id, targetType: 'user', targetId: user.id, ip: viewer.ip });
    });
  }

  async elevate(viewer: RequestViewer, password: string | undefined, code: string | undefined): Promise<number> {
    const user = viewer.user!;
    const ident = `elevate:${user.id}`;
    if ((await this.rateLimit.failuresSinceSuccess('elevate', ident, 15 * MINUTE)) >= 5) {
      throw Errors.code(ErrorCode.ACCOUNT_LOCKED, 'Çok fazla hatalı deneme. Lütfen biraz bekleyin.', 429);
    }
    const fields: Record<string, string> = {};
    if (!password || !(await this.hasher.verify(user.password_hash, password))) fields.password = 'Şifre hatalı.';
    if (!fields.password && (await this.twoFactor.isEnabled(user.id))) {
      if (!code) fields.code = 'İki adımlı doğrulama kodunu girin.';
      else if (!(await this.twoFactor.verify(user.id, code))) fields.code = 'Doğrulama kodu hatalı.';
    }
    if (Object.keys(fields).length) {
      await this.rateLimit.record('elevate', ident, viewer.ip, false);
      throw Errors.validation(fields, 'Doğrulama başarısız.');
    }
    await this.rateLimit.record('elevate', ident, viewer.ip, true);
    await this.audit.log({ type: 'security', action: 'session.elevated', actorId: user.id, targetType: 'user', targetId: user.id, ip: viewer.ip });
    return this.sessions.elevate(viewer.session!.id);
  }
}
