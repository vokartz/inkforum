import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  SETTINGS,
  SETTING_KEYS,
  effectiveLanding,
  pluginEnabled,
  settingDefaults,
  type PluginKey,
  type PublicSettings,
  type SettingKey,
  type SettingsValues,
} from '@forum/shared';
import { Db } from '../database/db.service.js';
import { CacheService } from '../cache/cache.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { zodFields } from '../common/validation.js';

const NS = 'settings';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger('Settings');
  private values: SettingsValues = settingDefaults();
  private loaded = false;

  constructor(
    private readonly db: Db,
    private readonly cache: CacheService,
    private readonly clock: Clock,
  ) {
    this.cache.onInvalidate(NS, () => this.reload());
  }

  async onModuleInit(): Promise<void> {
    // Tablolar henüz yoksa (migration öncesi) varsayılanlarla devam edilir; bootstrap sonrası yeniden yüklenir.
    await this.reload().catch(() => undefined);
  }

  async reload(): Promise<void> {
    const rows = await this.db.q.selectFrom('settings').select(['key', 'value_json']).execute();
    const next = settingDefaults() as Record<string, unknown>;
    for (const row of rows) {
      const def = SETTINGS[row.key as SettingKey];
      if (!def) continue;
      try {
        const parsed = def.schema.safeParse(JSON.parse(row.value_json));
        if (parsed.success) next[row.key] = parsed.data;
        else this.logger.warn(`Geçersiz ayar değeri yok sayıldı: ${row.key}`);
      } catch {
        this.logger.warn(`Bozuk ayar değeri yok sayıldı: ${row.key}`);
      }
    }
    this.values = next as SettingsValues;
    this.loaded = true;
  }

  get<K extends SettingKey>(key: K): SettingsValues[K] {
    return this.values[key];
  }

  /** Eklenti açık mı (Yönetim → Eklentiler) */
  plugin(key: PluginKey): boolean {
    return pluginEnabled(this.values as unknown as Record<string, unknown>, key);
  }

  /** Etkin açılış sayfası adresi; eklenti kapalıysa boş */
  landing(): string {
    return effectiveLanding(this.values as unknown as Record<string, unknown>);
  }

  all(): SettingsValues {
    return this.values;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  publicSettings(): PublicSettings {
    const out: Record<string, unknown> = {};
    for (const key of SETTING_KEYS) if (SETTINGS[key].public) out[key] = this.values[key];
    return out as PublicSettings;
  }

  /** Ayarları doğrular ve kaydeder. Varsayılana eşit değerlerin satırı silinir. */
  async update(patch: Record<string, unknown>, actorId: number | null, opts: { allowHidden?: boolean } = {}): Promise<string[]> {
    const fields: Record<string, string> = {};
    const valid: Array<[SettingKey, unknown]> = [];
    for (const [key, raw] of Object.entries(patch)) {
      const def = SETTINGS[key as SettingKey];
      if (!def || (def.hidden && !opts.allowHidden)) {
        fields[key] = 'Bilinmeyen ayar.';
        continue;
      }
      const parsed = def.schema.safeParse(raw);
      if (!parsed.success) {
        const f = zodFields(parsed.error);
        fields[key] = Object.values(f)[0] ?? 'Geçersiz değer.';
        continue;
      }
      valid.push([key as SettingKey, parsed.data]);
    }
    if (Object.keys(fields).length) throw Errors.validation(fields);
    const changed = await this.write(valid, actorId);
    return changed;
  }

  /** İç kullanım (doğrulamasız, gizli anahtarlar dahil). */
  async set<K extends SettingKey>(key: K, value: SettingsValues[K], actorId: number | null = null): Promise<void> {
    await this.write([[key, value]], actorId);
  }

  private async write(entries: Array<[SettingKey, unknown]>, actorId: number | null): Promise<string[]> {
    const now = this.clock.now();
    const defaults = settingDefaults() as Record<string, unknown>;
    const changed: string[] = [];
    await this.db.tx(async () => {
      for (const [key, value] of entries) {
        if (JSON.stringify(this.values[key]) !== JSON.stringify(value)) changed.push(key);
        if (JSON.stringify(defaults[key]) === JSON.stringify(value)) {
          await this.db.q.deleteFrom('settings').where('key', '=', key).execute();
        } else {
          const value_json = JSON.stringify(value);
          await this.db.q
            .insertInto('settings')
            .values({ key, value_json, updated_at: now, updated_by: actorId })
            .onConflict((oc) => oc.column('key').doUpdateSet({ value_json, updated_at: now, updated_by: actorId }))
            .execute();
        }
      }
      await this.cache.invalidate(NS);
    });
    return changed;
  }
}
