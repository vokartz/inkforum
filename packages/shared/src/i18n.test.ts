import { describe, expect, it } from 'vitest';
import { createMessageTranslator, format, matchAcceptLanguage, normalizeLocale, translate } from './i18n.js';

describe('i18n', () => {
  it('translates with fallback to the Turkish source', () => {
    const cat = { Kaydet: 'Save' };
    expect(translate(cat, 'en', 'Kaydet')).toBe('Save');
    expect(translate(cat, 'en', 'Vazgeç')).toBe('Vazgeç');
    expect(translate(cat, 'tr', 'Kaydet')).toBe('Kaydet');
  });

  it('formats placeholders and plurals', () => {
    expect(format('{n} konu', { n: 3 }, 'tr')).toBe('3 konu');
    const en = '{n, plural, =0 {no topics} one {# topic} other {# topics}}';
    expect(format(en, { n: 0 }, 'en')).toBe('no topics');
    expect(format(en, { n: 1 }, 'en')).toBe('1 topic');
    expect(format(en, { n: 1200 }, 'en')).toBe('1,200 topics');
    const ru = '{n, plural, one {# тема} few {# темы} many {# тем} other {# темы}}';
    expect(format(ru, { n: 3 }, 'ru')).toBe('3 темы');
    expect(format(ru, { n: 5 }, 'ru')).toBe('5 тем');
    expect(format('Merhaba {name}, {n, plural, one {# mesaj} other {# mesaj}}', { name: 'Ali', n: 2 }, 'tr')).toBe('Merhaba Ali, 2 mesaj');
  });

  it('translates pre-rendered server messages by pattern', () => {
    const tr = createMessageTranslator({ 'Şifre en az {n} karakter olmalı.': 'Password must be at least {n} characters.', 'Bölüm bulunamadı.': 'Board not found.' }, 'en');
    expect(tr('Şifre en az 10 karakter olmalı.')).toBe('Password must be at least 10 characters.');
    expect(tr('Bölüm bulunamadı.')).toBe('Board not found.');
    expect(tr('Bilinmeyen metin')).toBe('Bilinmeyen metin');
  });

  it('detects the best language', () => {
    expect(normalizeLocale('zh-Hans-CN')).toBe('zh');
    expect(matchAcceptLanguage('de-CH,de;q=0.9,en;q=0.8', ['tr', 'en', 'de'])).toBe('de');
    expect(matchAcceptLanguage('ja,fr;q=0.5', ['tr', 'en'])).toBeNull();
  });
});
