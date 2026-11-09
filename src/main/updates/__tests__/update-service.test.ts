import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GithubRelease } from '../github-feed.ts';
import { UPDATE_CHECK_INTERVAL_MS, UPDATE_STARTUP_DELAY_MS } from '../update-constants.ts';
import { UpdateService } from '../update-service.ts';
import { fullRelease, makeKeys } from './fixtures.ts';

const keys = makeKeys();
const zip = Buffer.alloc(5000, 3);
let dir = '';
let feed: GithubRelease[] = [];
let files = new Map<string, Buffer | string>();
let failing = false;
let fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tj-svc-'));
  feed = [];
  files = new Map();
  failing = false;
  fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (failing) return new Response('no', { status: 503 });
    if (url.includes('api.github.com')) return new Response(JSON.stringify(feed));
    const body = files.get(url);
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
  });
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

const service = (over: { currentVersion?: string; arch?: NodeJS.Architecture } = {}) =>
  new UpdateService({
    fetch: fetchMock,
    now: () => new Date('2026-02-03T04:05:06.000Z'),
    currentVersion: over.currentVersion ?? '1.0.0',
    arch: over.arch ?? 'arm64',
    updatesDir: join(dir, 'updates'),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
    publicKey: keys.publicKey,
  });

/** Publishes version `v` on the fake feed with its manifest and zip. */
function publish(v: string, arch: 'arm64' | 'x64' = 'arm64') {
  const r = fullRelease(keys, v, zip, arch);
  feed = [r.rel, ...feed.filter((x) => x.tag_name !== r.rel.tag_name)];
  files.set(r.manifestUrl, JSON.stringify(r.manifest));
  files.set(r.zipUrl, zip);
  return r;
}

describe('UpdateService check', () => {
  it('starts idle', () => {
    expect(service().getStatus()).toMatchObject({ phase: 'idle', currentVersion: '1.0.0' });
  });

  it('is up_to_date when the latest release is not newer', async () => {
    publish('1.0.0');
    const status = await service().check();
    expect(status).toMatchObject({ phase: 'up_to_date', checkedAt: '2026-02-03T04:05:06.000Z' });
  });

  it('is up_to_date with an empty feed', async () => {
    expect(await service().check()).toMatchObject({ phase: 'up_to_date', release: null });
  });

  it('is available for a newer, verified release', async () => {
    publish('1.1.0');
    const status = await service().check();
    expect(status).toMatchObject({
      phase: 'available',
      release: { version: '1.1.0', tag: 'v1.1.0', notes: 'notes' },
      error: null,
    });
  });

  it('goes through checking and notifies listeners', async () => {
    publish('1.1.0');
    const s = service();
    const phases: string[] = [];
    s.onChange((st) => phases.push(st.phase));
    await s.check();
    expect(phases).toEqual(['checking', 'available']);
  });

  it('is unverifiable for a manifest signed with another key', async () => {
    const r = publish('1.1.0');
    files.set(r.manifestUrl, JSON.stringify(fullRelease(makeKeys(), '1.1.0', zip).manifest));
    expect(await service().check()).toMatchObject({
      phase: 'unverifiable',
      unverifiableReason: 'public key mismatch',
    });
  });

  it('is unverifiable for a version or tag mismatch', async () => {
    const r = publish('1.1.0');
    files.set(r.manifestUrl, JSON.stringify(fullRelease(keys, '1.2.0', zip).manifest));
    expect(await service().check()).toMatchObject({
      phase: 'unverifiable',
      unverifiableReason: 'version mismatch',
    });
  });

  it('is unverifiable without update.json or without a zip for the arch', async () => {
    const r = publish('1.1.0');
    feed = [{ ...r.rel, assets: r.rel.assets.filter((a) => a.name !== 'update.json') }];
    expect(await service().check()).toMatchObject({
      phase: 'unverifiable',
      unverifiableReason: 'release has no update.json',
    });
    feed = [r.rel];
    expect(await service({ arch: 'x64' }).check()).toMatchObject({
      phase: 'unverifiable',
      unverifiableReason: 'manifest has no artifact for this architecture',
    });
  });

  it('fails without throwing when the feed is down or malformed', async () => {
    failing = true;
    expect(await service().check()).toMatchObject({
      phase: 'failed',
      error: 'GitHub responded 503',
    });
    failing = false;
    fetchMock.mockResolvedValueOnce(new Response('{"not":"a list"}'));
    expect(await service().check()).toMatchObject({ phase: 'failed' });
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await service().check()).toMatchObject({ phase: 'failed', error: 'offline' });
  });

  it('fails when the current version is not semver', async () => {
    publish('1.1.0');
    expect(await service({ currentVersion: 'dev' }).check()).toMatchObject({
      phase: 'failed',
      error: 'Current version unknown',
    });
  });

  it('joins a check already running', async () => {
    publish('1.1.0');
    const s = service();
    const [a, b] = await Promise.all([s.check(), s.check()]);
    expect(a).toBe(b);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('api.github.com'))).toHaveLength(
      1,
    );
  });
});

describe('UpdateService download', () => {
  it('only downloads from available', async () => {
    const s = service();
    expect(await s.download()).toMatchObject({ phase: 'idle' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('goes available -> downloading -> verified and keeps the file', async () => {
    publish('1.1.0');
    const s = service();
    await s.check();
    const phases: string[] = [];
    s.onChange((st) => phases.push(st.phase));
    const status = await s.download();
    expect(phases[0]).toBe('downloading');
    expect(status).toMatchObject({
      phase: 'verified',
      download: { bytes: 5000, totalBytes: 5000 },
    });
    const found = s.getVerifiedDownload();
    expect(found).toMatchObject({ version: '1.1.0', totalBytes: 5000 });
    expect(existsSync(found?.filePath ?? '')).toBe(true);
    expect(found?.filePath).toBe(join(dir, 'updates', 'v1.1.0', 'Tajmator-1.1.0-arm64-mac.zip'));
  });

  it('fails when the bytes do not match the manifest and leaves no file', async () => {
    const r = publish('1.1.0');
    files.set(r.zipUrl, Buffer.alloc(5000, 9));
    const s = service();
    await s.check();
    const status = await s.download();
    expect(status).toMatchObject({ phase: 'failed', download: null });
    expect(status.error).toContain('does not match the manifest');
    expect(s.getVerifiedDownload()).toBeNull();
    expect(existsSync(join(dir, 'updates', 'v1.1.0', 'Tajmator-1.1.0-arm64-mac.zip'))).toBe(false);
  });

  it('can be retried after a re-check following a failed download', async () => {
    const r = publish('1.1.0');
    files.set(r.zipUrl, Buffer.alloc(5000, 9));
    const s = service();
    await s.check();
    await s.download();
    files.set(r.zipUrl, zip);
    await s.check();
    expect(await s.download()).toMatchObject({ phase: 'verified' });
  });

  it('removes the downloads of other versions', async () => {
    publish('1.1.0');
    const s = service();
    await s.check();
    await s.download();
    publish('1.2.0');
    await s.check();
    await s.download();
    expect(existsSync(join(dir, 'updates', 'v1.1.0'))).toBe(false);
    expect(existsSync(join(dir, 'updates', 'v1.2.0'))).toBe(true);
  });
});

describe('UpdateService re-check', () => {
  async function verified(): Promise<UpdateService> {
    publish('1.1.0');
    const s = service();
    await s.check();
    await s.download();
    return s;
  }

  it('keeps a verified download when the re-check fails', async () => {
    const s = await verified();
    failing = true;
    expect(await s.check()).toMatchObject({ phase: 'verified', error: null });
    expect(s.getVerifiedDownload()).not.toBeNull();
  });

  it('keeps it when the same release is found again', async () => {
    const s = await verified();
    const phases: string[] = [];
    s.onChange((st) => phases.push(st.phase));
    expect(await s.check()).toMatchObject({ phase: 'verified' });
    expect(phases).toEqual(['verified']);
  });

  it('replaces it when a newer release appears', async () => {
    const s = await verified();
    publish('1.2.0');
    expect(await s.check()).toMatchObject({ phase: 'available', release: { version: '1.2.0' } });
    expect(s.getVerifiedDownload()).toBeNull();
  });

  it('does not check while installing and can return from it', async () => {
    const s = await verified();
    s.setInstalling(true);
    expect(s.getStatus().phase).toBe('installing');
    fetchMock.mockClear();
    await s.check();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(s.getVerifiedDownload()).not.toBeNull();
    s.setInstalling(false);
    expect(s.getStatus().phase).toBe('verified');
  });
});

describe('UpdateService schedule', () => {
  it('checks after 10 s, then every 6 h, until stopped', async () => {
    vi.useFakeTimers();
    const s = service();
    const check = vi.spyOn(s, 'check');
    s.start();
    s.start();
    await vi.advanceTimersByTimeAsync(UPDATE_STARTUP_DELAY_MS - 1);
    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(3);
    s.stop();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS * 2);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('stop before the first check cancels it', async () => {
    vi.useFakeTimers();
    const s = service();
    const check = vi.spyOn(s, 'check');
    s.start();
    s.stop();
    await vi.advanceTimersByTimeAsync(UPDATE_STARTUP_DELAY_MS * 2);
    expect(check).not.toHaveBeenCalled();
  });

  it('a feed failure on the schedule does not stop it', async () => {
    vi.useFakeTimers();
    failing = true;
    const s = service();
    s.start();
    await vi.advanceTimersByTimeAsync(UPDATE_STARTUP_DELAY_MS);
    expect(s.getStatus().phase).toBe('failed');
    failing = false;
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(s.getStatus().phase).toBe('up_to_date');
    s.stop();
  });
});
