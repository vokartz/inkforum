import { describe, expect, it } from 'vitest';
import { autoInstallAllows, compareVersions, pickReleaseNotes, updateKind } from './updates.js';
import { renderMarkdown } from './markdown.js';

describe('versions', () => {
  it('compares semantic versions', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
    expect(compareVersions('v1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0-beta.2', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.2')).toBe(1);
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
    expect(compareVersions('garbage', '0.0.1')).toBe(-1);
  });

  it('classifies updates and applies the auto-install policy', () => {
    expect(updateKind('1.2.3', '1.2.4')).toBe('patch');
    expect(updateKind('1.2.3', '1.3.0')).toBe('minor');
    expect(updateKind('1.2.3', '2.0.0')).toBe('major');
    expect(updateKind('1.2.3', '1.2.3')).toBeNull();
    expect(autoInstallAllows('patch', 'patch')).toBe(true);
    expect(autoInstallAllows('patch', 'minor')).toBe(false);
    expect(autoInstallAllows('minor', 'major')).toBe(false);
    expect(autoInstallAllows('all', 'major')).toBe(true);
    expect(autoInstallAllows('off', 'patch')).toBe(false);
  });
});

describe('markdown', () => {
  it('renders the common release-note syntax', () => {
    const html = renderMarkdown('## Yeni\n\n- **Wiki** eklendi\n- Düzeltme `kod`\n  - alt madde\n\n1. bir\n2. iki\n\n> not\n\n[site](https://example.com)');
    expect(html).toContain('<h4>Yeni</h4>');
    expect(html).toContain('<ul><li><strong>Wiki</strong> eklendi</li><li>Düzeltme <code>kod</code><ul><li>alt madde</li></ul></li></ul>');
    expect(html).toContain('<ol><li>bir</li><li>iki</li></ol>');
    expect(html).toContain('<blockquote><p>not</p></blockquote>');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">site</a>');
  });

  it('never emits raw HTML or unsafe links', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) <img src=x onerror=1>\n\n```\n<b>kod</b>\n```');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('&lt;b&gt;kod&lt;/b&gt;');
  });
});

describe('pickReleaseNotes', () => {
  const body = '### Fixes\n\n- English\n\n<!-- inkforum:tr -->\n<details>\n<summary>Türkçe sürüm notları</summary>\n\n### Düzeltmeler\n\n- Türkçe\n\n</details>\n';
  it('shows the section matching the admin language', () => {
    expect(pickReleaseNotes(body, 'en')).toBe('### Fixes\n\n- English');
    expect(pickReleaseNotes(body, 'tr')).toBe('### Düzeltmeler\n\n- Türkçe');
    expect(pickReleaseNotes('- old note', 'tr')).toBe('- old note');
  });
});
