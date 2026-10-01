import { describe, expect, it } from 'vitest';
import { canonicalEmail, canonicalName, likePattern, slugify } from './canonical.js';
import { ageOn, passwordIssue, usernameIssue } from './validation.js';
import { PERMISSIONS } from './permissions.js';
import { SETTINGS, settingDefaults } from './settings.js';

describe('canonicalName', () => {
  it('folds Turkish dotted/dotless i variants together', () => {
    const variants = ['Ilker', 'İlker', 'ılker', 'ilker', 'ILKER', 'İLKER'];
    const keys = new Set(variants.map(canonicalName));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe('ilker');
  });

  it('removes zero-width characters and collapses spaces', () => {
    expect(canonicalName('  Ali​  Veli ')).toBe('ali veli');
  });

  it('normalizes compatibility characters', () => {
    expect(canonicalName('Ｆｏｒｕｍ')).toBe('forum');
  });
});

describe('canonicalEmail', () => {
  it('lowercases and punycodes the domain', () => {
    expect(canonicalEmail(' Ali@Örnek.COM ')).toBe('ali@xn--rnek-4qa.com');
  });
});

describe('helpers', () => {
  it('escapes LIKE wildcards', () => {
    expect(likePattern('a%b_', 'prefix')).toBe('a\\%b\\_%');
  });

  it('slugifies Turkish names', () => {
    expect(slugify('Çağrı Şükrü Öztürk')).toBe('cagri-sukru-ozturk');
    expect(slugify('!!!')).toBe('uye');
  });

  it('validates usernames', () => {
    const rules = { minLength: 3, maxLength: 25 };
    expect(usernameIssue('Çağrı_42', rules)).toBeNull();
    expect(usernameIssue('ab', rules)).not.toBeNull();
    expect(usernameIssue('_abc', rules)).not.toBeNull();
    expect(usernameIssue('a..b', rules)).not.toBeNull();
    expect(usernameIssue('ali veli', rules)).toBeNull();
  });

  it('validates passwords', () => {
    const rules = { minLength: 8, requireMixed: true };
    expect(passwordIssue('abcdefgh', rules)).not.toBeNull();
    expect(passwordIssue('abcdefg1', rules)).toBeNull();
    expect(passwordIssue('İlker123', rules, 'ilker123')).not.toBeNull();
  });

  it('computes age', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    expect(ageOn('2013-06-15', now)).toBe(13);
    expect(ageOn('2013-06-16', now)).toBe(12);
  });
});

describe('registries', () => {
  it('has unique permission keys', () => {
    const keys = PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has defaults valid against their schemas', () => {
    const defaults = settingDefaults();
    for (const [key, def] of Object.entries(SETTINGS)) {
      expect(def.schema.safeParse(defaults[key as keyof typeof defaults]).success, key).toBe(true);
    }
  });
});
