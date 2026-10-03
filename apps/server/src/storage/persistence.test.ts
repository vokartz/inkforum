import { describe, expect, it } from 'vitest';
import { detectStoragePersistence } from './persistence.js';

const ROOT = '612 540 0:331 / / rw,relatime master:301 - overlay overlay rw,lowerdir=/var/lib/docker/overlay2/l/ABC';
const PROC = '613 612 0:334 / /proc rw,nosuid,nodev,noexec,relatime - proc proc rw';
const ANON = 'f'.repeat(64);
const mount = (root: string, target: string, fs = 'ext4') => `640 612 8:1 ${root} ${target} rw,relatime - ${fs} /dev/sda1 rw`;

describe('detectStoragePersistence', () => {
  it('flags an anonymous Docker volume (VOLUME without a platform mount)', () => {
    const info = [ROOT, PROC, mount(`/var/lib/docker/volumes/${ANON}/_data`, '/app/storage')].join('\n');
    expect(detectStoragePersistence('/app/storage', info)).toEqual({ ephemeral: true, reason: 'anonymous-volume', volume: ANON });
  });

  it('detects volumes when the Docker data root is its own partition', () => {
    const info = [ROOT, mount(`/volumes/${ANON}/_data`, '/app/storage')].join('\n');
    expect(detectStoragePersistence('/app/storage', info).reason).toBe('anonymous-volume');
  });

  it('accepts named volumes and bind mounts', () => {
    expect(detectStoragePersistence('/app/storage', [ROOT, mount('/var/lib/docker/volumes/x1y2-inkforum-storage/_data', '/app/storage')].join('\n')).ephemeral).toBe(false);
    expect(detectStoragePersistence('/app/storage', [ROOT, mount('/srv/forum/storage', '/app/storage')].join('\n')).ephemeral).toBe(false);
    expect(detectStoragePersistence('/app/storage', [ROOT, mount('/data', '/app')].join('\n')).ephemeral).toBe(false);
  });

  it('flags the container filesystem and tmpfs', () => {
    expect(detectStoragePersistence('/app/storage', [ROOT, PROC].join('\n'))).toMatchObject({ ephemeral: true, reason: 'container-fs' });
    expect(detectStoragePersistence('/app/storage', [ROOT, mount('/', '/app/storage', 'tmpfs')].join('\n')).ephemeral).toBe(true);
    expect(detectStoragePersistence('/app/storage', mount('/', '/')).ephemeral).toBe(false);
  });

  it('uses the most specific mount and ignores siblings', () => {
    const info = [ROOT, mount('/srv/storage', '/app/storage'), mount(`/var/lib/docker/volumes/${ANON}/_data`, '/app/storage-old')].join('\n');
    expect(detectStoragePersistence('/app/storage', info).ephemeral).toBe(false);
  });

  it('stays quiet when mountinfo is empty', () => {
    expect(detectStoragePersistence('/app/storage', '').ephemeral).toBe(false);
  });
});
