import { mkdir, mkdtemp, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  type BundleIdentity,
  bundleIdentity,
  cleanLeftovers,
  isTranslocated,
  prepareWorkDir,
  type RmFn,
  runningBundle,
  swapBundle,
  trashDir,
  workDir,
} from '../bundle-swap.ts';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'tj-swap-'));
  const bundle = join(dir, 'Tajmator.app');
  await mkdir(bundle);
  await writeFile(join(bundle, 'v'), 'old');
  const work = workDir(bundle);
  const next = join(work, 'stage', 'app', 'Tajmator.app');
  await mkdir(next, { recursive: true });
  await writeFile(join(next, 'v'), 'new');
  return { bundle, work, next };
}

describe('bundle paths', () => {
  it('finds the running bundle and translocation', () => {
    expect(runningBundle('/Applications/X.app/Contents/MacOS/X')).toBe('/Applications/X.app');
    expect(runningBundle('/repo/node_modules/electron/dist/electron')).toBeNull();
    expect(isTranslocated('/private/var/AppTranslocation/ABC/d/X.app')).toBe(true);
    expect(isTranslocated('/Applications/X.app')).toBe(false);
  });
});

describe('swapBundle', () => {
  it('replaces the bundle and parks the old one', async () => {
    const { bundle, work, next } = await fixture();
    await swapBundle(bundle, next, work);
    expect(await readFile(join(bundle, 'v'), 'utf8')).toBe('new');
    expect(await readFile(join(work, 'previous.app', 'v'), 'utf8')).toBe('old');
    expect((await cleanLeftovers(bundle, null)).ok).toBe(true);
    await expect(stat(work)).rejects.toThrow();
    expect(await readFile(join(bundle, 'v'), 'utf8')).toBe('new');
  });

  it('rolls back when the second rename fails', async () => {
    const { bundle, work, next } = await fixture();
    let calls = 0;
    const flaky = async (from: string, to: string) => {
      calls += 1;
      if (calls === 2) throw new Error('boom');
      await rename(from, to);
    };
    await expect(swapBundle(bundle, next, work, flaky)).rejects.toThrow('boom');
    expect(await readFile(join(bundle, 'v'), 'utf8')).toBe('old');
  });

  it('names the parked app when the rollback also fails', async () => {
    const { bundle, work, next } = await fixture();
    let calls = 0;
    const broken = async (from: string, to: string) => {
      calls += 1;
      if (calls >= 2) throw new Error(calls === 2 ? 'boom' : 'again');
      await rename(from, to);
    };
    await expect(swapBundle(bundle, next, work, broken)).rejects.toThrow(
      `boom; rollback failed, the previous app is at ${join(work, 'previous.app')}`,
    );
  });
});

async function leftover(bundle: string) {
  const asar = join(workDir(bundle), 'previous.app', 'Contents', 'Resources');
  await mkdir(asar, { recursive: true });
  await writeFile(join(asar, 'app.asar'), 'asar');
  await mkdir(join(workDir(bundle), 'stage', 'x'), { recursive: true });
  return join(workDir(bundle), 'previous.app');
}

const failingRm: RmFn = async () => {
  throw Object.assign(new Error('ENOTEMPTY: directory not empty'), { code: 'ENOTEMPTY' });
};
const failingRename = async () => {
  throw new Error('rename denied');
};
const trashes = async (bundle: string) =>
  (await readdir(join(bundle, '..'))).filter((n) => n.startsWith('.tajmator-update-trash-'));

describe('prepareWorkDir', () => {
  it('clears a non-empty previous.app so a later swap succeeds', async () => {
    const { bundle } = await fixture();
    await leftover(bundle);
    const work = await prepareWorkDir(bundle, null);
    expect(await readdir(work)).toEqual([]);
    expect((await stat(work)).mode & 0o777).toBe(0o700);
    const next = join(work, 'stage', 'Tajmator.app');
    await mkdir(next, { recursive: true });
    await swapBundle(bundle, next, work);
    expect(await readdir(join(work, 'previous.app'))).toEqual(['v']);
  });

  it('renames the leftover aside when rm fails', async () => {
    const { bundle } = await fixture();
    await leftover(bundle);
    const work = await prepareWorkDir(bundle, null, failingRm);
    expect(await readdir(work)).toEqual([]);
    expect((await stat(work)).mode & 0o777).toBe(0o700);
    expect(await trashes(bundle)).toHaveLength(1);
  });

  it('never removes the running bundle, only moves it aside', async () => {
    const { bundle } = await fixture();
    const previous = await leftover(bundle);
    const running = await bundleIdentity(previous);
    const rmFn = vi.fn<RmFn>(async () => undefined);
    const work = await prepareWorkDir(bundle, running, rmFn);
    expect(rmFn).not.toHaveBeenCalled();
    expect(await readdir(work)).toEqual([]);
    const [trash] = await trashes(bundle);
    expect(await exists(join(bundle, '..', trash ?? '', 'previous.app', 'Contents'))).toBe(true);
  });

  it('rejects when rm and rename both fail', async () => {
    const { bundle } = await fixture();
    await leftover(bundle);
    await expect(prepareWorkDir(bundle, null, failingRm, failingRename)).rejects.toThrow(
      'rename denied',
    );
  });
});

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

describe('cleanLeftovers', () => {
  it('removes a non-empty work dir', async () => {
    const { bundle, work } = await fixture();
    await leftover(bundle);
    const result = await cleanLeftovers(bundle, null);
    expect(result).toEqual({ ok: true, removed: [work], deferred: [], error: null });
  });

  it('renames the work dir aside and reports it deferred when rm fails', async () => {
    const { bundle, work } = await fixture();
    await leftover(bundle);
    const result = await cleanLeftovers(bundle, null, failingRm);
    const [trash] = await trashes(bundle);
    expect(result.ok).toBe(true);
    expect(result.deferred).toEqual([join(bundle, '..', trash ?? '')]);
    expect(result.error).toContain('ENOTEMPTY');
    expect(await exists(work)).toBe(false);
  });

  it('drains the trash on the next call', async () => {
    const { bundle } = await fixture();
    await leftover(bundle);
    await cleanLeftovers(bundle, null, failingRm);
    const result = await cleanLeftovers(bundle, null);
    expect(result.ok).toBe(true);
    expect(result.removed).toHaveLength(1);
    expect(await trashes(bundle)).toEqual([]);
  });

  it('never passes the running bundle to rm', async () => {
    const { bundle, work } = await fixture();
    const previous = await leftover(bundle);
    const running: BundleIdentity | null = await bundleIdentity(previous);
    const rmFn = vi.fn<RmFn>(async () => undefined);
    const result = await cleanLeftovers(bundle, running, rmFn);
    expect(rmFn).not.toHaveBeenCalled();
    expect(result.deferred).toEqual([work]);
    expect(result.ok).toBe(false);
    expect(await exists(previous)).toBe(true);
  });

  it('reports ok false with an error when rm and rename both fail', async () => {
    const { bundle } = await fixture();
    await leftover(bundle);
    const result = await cleanLeftovers(bundle, null, failingRm, failingRename);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('rename denied');
  });

  it('keeps an undeletable trash dir deferred', async () => {
    const { bundle } = await fixture();
    const trash = trashDir(bundle, 'abc');
    await mkdir(trash);
    const result = await cleanLeftovers(bundle, null, failingRm);
    expect(result.deferred).toContain(trash);
    expect(await exists(trash)).toBe(true);
  });
});
