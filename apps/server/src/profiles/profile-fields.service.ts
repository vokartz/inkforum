import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ProfileFieldType, ProfileFieldVisibility, Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { CacheService } from '../cache/cache.service.js';
import { Errors } from '../common/errors.js';
import { bool, fromJsonSchema, toJson } from '../database/json.js';

const NS = 'profile_fields';

export interface ProfileFieldDto {
  id: number;
  key: string;
  name: string;
  description: string;
  type: ProfileFieldType;
  options: string[];
  regex: string | null;
  maxLength: number;
  isRequired: boolean;
  showOnRegister: boolean;
  showInProfile: boolean;
  showInPosts: boolean;
  visibility: ProfileFieldVisibility;
  editableBy: 'owner' | 'staff';
  isActive: boolean;
  sortOrder: number;
}

export type FieldAudience = 'guest' | 'member' | 'owner' | 'staff';

export const profileFieldInputSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,39}$/, 'Anahtar küçük harfle başlamalı; yalnızca a-z, 0-9 ve _ içerebilir.'),
  name: z.string().trim().min(1, 'Ad gerekli.').max(60),
  description: z.string().trim().max(300).default(''),
  type: z.enum(['text', 'textarea', 'select', 'radio', 'checkbox', 'url', 'number', 'date']),
  options: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  regex: z.string().trim().max(200).nullable().default(null),
  maxLength: z.number().int().min(1).max(5000).default(255),
  isRequired: z.boolean().default(false),
  showOnRegister: z.boolean().default(false),
  showInProfile: z.boolean().default(true),
  showInPosts: z.boolean().default(false),
  visibility: z.enum(['public', 'members', 'owner_staff', 'staff']).default('public'),
  editableBy: z.enum(['owner', 'staff']).default('owner'),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type ProfileFieldInput = z.infer<typeof profileFieldInputSchema>;

@Injectable()
export class ProfileFieldsService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly cache: CacheService,
  ) {}

  private toDto(r: Row<'profile_fields'>): ProfileFieldDto {
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      type: r.type,
      options: fromJsonSchema(z.array(z.string()), r.options_json, []),
      regex: r.regex,
      maxLength: r.max_length,
      isRequired: bool(r.is_required),
      showOnRegister: bool(r.show_on_register),
      showInProfile: bool(r.show_in_profile),
      showInPosts: bool(r.show_in_posts),
      visibility: r.visibility,
      editableBy: r.editable_by,
      isActive: bool(r.is_active),
      sortOrder: r.sort_order,
    };
  }

  async all(): Promise<ProfileFieldDto[]> {
    return this.cache.wrap(NS, 'all', async () => {
      const rows = await this.db.q.selectFrom('profile_fields').selectAll().orderBy('sort_order').orderBy('id').execute();
      return rows.map((r) => this.toDto(r));
    });
  }

  async active(): Promise<ProfileFieldDto[]> {
    return (await this.all()).filter((f) => f.isActive);
  }

  async forRegistration(): Promise<ProfileFieldDto[]> {
    return (await this.active()).filter((f) => f.showOnRegister);
  }

  /** Alan değerini tipine göre doğrular ve normalleştirir. Boş değer '' döner. */
  validateValue(field: ProfileFieldDto, raw: unknown): string {
    const value = typeof raw === 'boolean' ? (raw ? '1' : '') : String(raw ?? '').trim();
    if (!value) {
      if (field.isRequired) throw new Error(`${field.name} gerekli.`);
      return '';
    }
    if ([...value].length > field.maxLength) throw new Error(`${field.name} en fazla ${field.maxLength} karakter olabilir.`);
    switch (field.type) {
      case 'select':
      case 'radio':
        if (!field.options.includes(value)) throw new Error(`${field.name} için geçersiz seçim.`);
        break;
      case 'checkbox':
        if (value !== '1') throw new Error(`${field.name} için geçersiz değer.`);
        break;
      case 'url':
        if (!/^https?:\/\/[^\s]+$/i.test(value)) throw new Error(`${field.name} geçerli bir http(s) adresi olmalı.`);
        break;
      case 'number':
        if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`${field.name} bir sayı olmalı.`);
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
          throw new Error(`${field.name} geçerli bir tarih olmalı.`);
        }
        break;
      case 'text':
        if (/[\r\n]/.test(value)) throw new Error(`${field.name} tek satır olmalı.`);
        break;
    }
    if (field.regex && (field.type === 'text' || field.type === 'textarea')) {
      let re: RegExp | null;
      try {
        re = new RegExp(field.regex, 'u');
      } catch {
        re = null;
      }
      if (re && !re.test(value)) throw new Error(`${field.name} beklenen biçimde değil.`);
    }
    return value;
  }

  /** Verilen alanlar için girdiyi doğrular; alan anahtarı -> hata biçiminde toplu hata fırlatır. */
  validateAll(fields: ProfileFieldDto[], input: Record<string, unknown>): Map<number, string> {
    const out = new Map<number, string>();
    const errors: Record<string, string> = {};
    for (const f of fields) {
      try {
        out.set(f.id, this.validateValue(f, input[f.key]));
      } catch (err) {
        errors[`customFields.${f.key}`] = (err as Error).message;
      }
    }
    if (Object.keys(errors).length) throw Errors.validation(errors);
    return out;
  }

  async saveValues(userId: number, values: Map<number, string>): Promise<void> {
    for (const [fieldId, value] of values) {
      if (value === '') {
        await this.db.q
          .deleteFrom('user_profile_field_values')
          .where('user_id', '=', userId)
          .where('field_id', '=', fieldId)
          .execute();
      } else {
        await this.db.q
          .insertInto('user_profile_field_values')
          .values({ user_id: userId, field_id: fieldId, value })
          .onConflict((oc) => oc.columns(['user_id', 'field_id']).doUpdateSet({ value }))
          .execute();
      }
    }
  }

  canSee(field: ProfileFieldDto, audience: FieldAudience): boolean {
    switch (field.visibility) {
      case 'public':
        return true;
      case 'members':
        return audience !== 'guest';
      case 'owner_staff':
        return audience === 'owner' || audience === 'staff';
      case 'staff':
        return audience === 'staff';
    }
  }

  /** Kullanıcının alan değerleri (hedef kitleye göre filtrelenmiş). */
  async valuesFor(userId: number, audience: FieldAudience, onlyProfile = true) {
    const fields = (await this.active()).filter((f) => (!onlyProfile || f.showInProfile) && this.canSee(f, audience));
    if (!fields.length) return [];
    const rows = await this.db.q
      .selectFrom('user_profile_field_values')
      .select(['field_id', 'value'])
      .where('user_id', '=', userId)
      .where('field_id', 'in', fields.map((f) => f.id))
      .execute();
    const map = new Map(rows.map((r) => [r.field_id, r.value]));
    return fields
      .map((f) => ({ key: f.key, name: f.name, type: f.type, value: map.get(f.id) ?? '' }))
      .filter((v) => v.value !== '');
  }

  /** Düzenleme formu için: alanlar + mevcut değerler. */
  async editableFor(userId: number, isStaff: boolean) {
    const fields = (await this.active()).filter((f) => f.editableBy === 'owner' || isStaff);
    const rows = await this.db.q
      .selectFrom('user_profile_field_values')
      .select(['field_id', 'value'])
      .where('user_id', '=', userId)
      .execute();
    const map = new Map(rows.map((r) => [r.field_id, r.value]));
    return fields.map((f) => ({ ...f, value: map.get(f.id) ?? '' }));
  }

  // ---------- Yönetim ----------

  async create(input: ProfileFieldInput): Promise<number> {
    this.checkInput(input);
    const exists = await this.db.q.selectFrom('profile_fields').select('id').where('key', '=', input.key).executeTakeFirst();
    if (exists) throw Errors.conflict('Bu anahtar kullanılıyor.', { key: 'Bu anahtar kullanılıyor.' });
    const now = this.clock.now();
    const row = await this.db.q
      .insertInto('profile_fields')
      .values({ ...this.toRow(input), created_at: now, updated_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.cache.invalidate(NS);
    return row.id;
  }

  async update(id: number, input: ProfileFieldInput): Promise<void> {
    this.checkInput(input);
    const existing = await this.db.q.selectFrom('profile_fields').select(['id', 'key']).where('id', '=', id).executeTakeFirst();
    if (!existing) throw Errors.notFound('Alan bulunamadı.');
    if (existing.key !== input.key) {
      const clash = await this.db.q.selectFrom('profile_fields').select('id').where('key', '=', input.key).executeTakeFirst();
      if (clash) throw Errors.conflict('Bu anahtar kullanılıyor.', { key: 'Bu anahtar kullanılıyor.' });
    }
    await this.db.q
      .updateTable('profile_fields')
      .set({ ...this.toRow(input), updated_at: this.clock.now() })
      .where('id', '=', id)
      .execute();
    await this.cache.invalidate(NS);
  }

  async delete(id: number): Promise<void> {
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('user_profile_field_values').where('field_id', '=', id).execute();
      await this.db.q.deleteFrom('profile_fields').where('id', '=', id).execute();
      await this.cache.invalidate(NS);
    });
  }

  private checkInput(input: ProfileFieldInput): void {
    if ((input.type === 'select' || input.type === 'radio') && input.options.length < 2) {
      throw Errors.field('options', 'Seçimli alanlar en az iki seçenek içermeli.');
    }
    if (input.regex) {
      try {
        new RegExp(input.regex, 'u');
      } catch {
        throw Errors.field('regex', 'Geçersiz düzenli ifade.');
      }
    }
  }

  private toRow(input: ProfileFieldInput) {
    return {
      key: input.key,
      name: input.name,
      description: input.description,
      type: input.type,
      options_json: input.options.length ? toJson(input.options) : null,
      regex: input.regex || null,
      max_length: input.maxLength,
      is_required: input.isRequired,
      show_on_register: input.showOnRegister,
      show_in_profile: input.showInProfile,
      show_in_posts: input.showInPosts,
      visibility: input.visibility,
      editable_by: input.editableBy,
      is_active: input.isActive,
      sort_order: input.sortOrder,
    };
  }
}
