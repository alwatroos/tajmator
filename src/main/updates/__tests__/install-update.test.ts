import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GATEKEEPER_NOTE,
  NOT_PACKAGED_NOTE,
  NOT_WRITABLE_NOTE,
  SIGNATURE_MISMATCH_NOTE,
  TRANSLOCATED_NOTE,
} from '../../../shared/updates.ts';
import { type BundleIdentity, bundleIdentity, workDir } from '../bundle-swap.ts';
import { CODESIGN, DITTO, type ExecFn, PLUTIL } from '../code-signature.ts';
import {
  createInstallUpdate,
  type InstallLogger,
  type InstallUpdateDeps,
} from '../install-update.ts';

const SIGNED = 'Identifier=app.id\nAuthority=Developer ID Application: X (T1)\nTeamIdentifier=T1';
const ADHOC = 'Identifier=app.id\nSignature=adhoc\nTeamIdentifier=not set';
const SHA = createHash('sha256').update('zip').digest('hex');

let root = '';
let zip = '';
let bundle = '';
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tj-inst-'));
  await mkdir(join(root, 'home', 'updates', 'v1'), { recursive: true });
  zip = join(root, 'home', 'updates', 'v1', 'a.zip');
  await writeFile(zip, 'zip');
  bundle = join(root, 'apps', 'Tajmator.app');
  await mkdir(join(bundle, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(join(bundle, 'marker'), 'old');
});

const download = () => ({ version: '1.2.0', filePath: zip, sha256: SHA, totalBytes: 3 });

type Opts = {
  current?: string;
  next?: string;
  verify?: number;
  ditto?: boolean;
  appVersion?: string;
  identity?: BundleIdentity | null;
  relaunch?: () => void;
  log?: InstallLogger;
  removeTree?: InstallUpdateDeps['removeTree'];
};

async function fakeDitto(args: readonly string[], create: boolean) {
  if (create) {
    const app = join(args[3] as string, 'Tajmator.app');
    await mkdir(app, { recursive: true });
    await writeFile(join(app, 'marker'), 'new');
  }
  return { code: 0, stdout: '', stderr: '' };
}

function fakeSigning(file: string, args: readonly string[], opts: Opts) {
  const isNew = (args[args.length - 1] as string).includes('.tajmator-update');
  if (file === CODESIGN && args[0] === '-dv') {
    return {
      code: 0,
      stdout: '',
      stderr: isNew ? (opts.next ?? SIGNED) : (opts.current ?? SIGNED),
    };
  }
  if (file === PLUTIL) return { code: 0, stdout: `${opts.appVersion ?? '1.2.0'}\n`, stderr: '' };
  if (file === CODESIGN) return { code: opts.verify ?? 0, stdout: '', stderr: '' };
  return { code: 0, stdout: '', stderr: 'source=Notarized Developer ID' };
}

function setup(opts: Opts = {}) {
  const exec = vi.fn<ExecFn>(async (file, args) =>
    file === DITTO ? fakeDitto(args, opts.ditto !== false) : fakeSigning(file, args, opts),
  );
  const deps: InstallUpdateDeps = {
    getVerifiedDownload: () => download(),
    exec,
    updatesDir: join(root, 'home', 'updates'),
    exePath: join(bundle, 'Contents', 'MacOS', 'Tajmator'),
    isPackaged: true,
    runningIdentity: opts.identity ?? null,
    revealFile: vi.fn(),
    relaunch: opts.relaunch ? vi.fn(opts.relaunch) : vi.fn(),
    log: opts.log ?? { log: vi.fn() },
    ...(opts.removeTree ? { removeTree: opts.removeTree } : {}),
  };
  return { deps, exec, install: createInstallUpdate(deps) };
}

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

describe('installUpdate', () => {
  it('swaps and relaunches when both apps are the same Developer ID', async () => {
    const { deps, install } = setup();
    expect(await install({ version: '1.2.0' })).toEqual({
      outcome: 'restarting',
      version: '1.2.0',
    });
    expect(await readFile(join(bundle, 'marker'), 'utf8')).toBe('new');
    expect(deps.relaunch).toHaveBeenCalledTimes(1);
    expect(deps.revealFile).not.toHaveBeenCalled();
  });

  it('is manual for an unsigned running app and copies nothing', async () => {
    const { deps, exec, install } = setup({ current: ADHOC });
    const result = await install({ version: '1.2.0' });
    expect(result).toMatchObject({
      outcome: 'manual',
      reason: 'unsigned_app',
      note: GATEKEEPER_NOTE,
    });
    expect(deps.revealFile).toHaveBeenCalledWith(
      await import('node:fs/promises').then((f) => f.realpath(zip)),
    );
    expect(exec.mock.calls.some(([file]) => file === DITTO)).toBe(false);
    expect(await readFile(join(bundle, 'marker'), 'utf8')).toBe('old');
  });

  it('is manual for an unsigned or foreign artifact and removes the stage', async () => {
    for (const next of [ADHOC, SIGNED.replaceAll('T1', 'T2')]) {
      const { deps, install } = setup({ next });
      const reason = next === ADHOC ? 'unsigned_artifact' : 'signature_mismatch';
      expect(await install({ version: '1.2.0' })).toMatchObject({ reason });
      expect(deps.relaunch).not.toHaveBeenCalled();
      expect(await exists(join(bundle, '..', '.tajmator-update', 'stage'))).toBe(false);
      expect(await readFile(join(bundle, 'marker'), 'utf8')).toBe('old');
    }
  });

  it('is manual when not packaged or translocated', async () => {
    const a = setup();
    expect(
      await createInstallUpdate({ ...a.deps, isPackaged: false })({ version: '1.2.0' }),
    ).toMatchObject({ reason: 'not_packaged', note: NOT_PACKAGED_NOTE });
    const b = setup();
    const moved = { ...b.deps, exePath: '/x/AppTranslocation/Z/d/A.app/Contents/MacOS/A' };
    expect(await createInstallUpdate(moved)({ version: '1.2.0' })).toMatchObject({
      reason: 'translocated',
      note: TRANSLOCATED_NOTE,
    });
    for (const note of [TRANSLOCATED_NOTE, NOT_WRITABLE_NOTE, NOT_PACKAGED_NOTE]) {
      expect(note).not.toBe(GATEKEEPER_NOTE);
      expect(note).not.toContain('not signed by the publisher');
    }
  });

  it('fails without relaunch when the update changed, extraction is empty or the version differs', async () => {
    const a = setup();
    await writeFile(zip, 'tampered');
    expect(await a.install({ version: '1.2.0' })).toEqual({
      outcome: 'failed',
      error: 'Update file changed after verification',
    });
    expect(a.deps.relaunch).not.toHaveBeenCalled();
    await writeFile(zip, 'zip');
    const b = setup({ ditto: false });
    expect(await b.install({ version: '1.2.0' })).toMatchObject({ outcome: 'failed' });
    const c = setup();
    expect(await c.install({ version: '9.9.9' })).toMatchObject({ outcome: 'failed' });
    expect(c.deps.relaunch).not.toHaveBeenCalled();
  });

  it('joins a concurrent call', async () => {
    const { deps, install } = setup();
    const [a, b] = await Promise.all([
      install({ version: '1.2.0' }),
      install({ version: '1.2.0' }),
    ]);
    expect(a).toBe(b);
    expect(deps.relaunch).toHaveBeenCalledTimes(1);
  });

  it('uses a note without the Gatekeeper bypass for a foreign signature', async () => {
    const { install } = setup({ next: SIGNED.replaceAll('T1', 'T2') });
    const result = await install({ version: '1.2.0' });
    expect(result).toMatchObject({ note: SIGNATURE_MISMATCH_NOTE });
    expect(SIGNATURE_MISMATCH_NOTE).not.toContain('xattr');
  });

  it('refuses a downgrade: the extracted app version must equal the request', async () => {
    const { deps, install } = setup({ appVersion: '1.0.0' });
    expect(await install({ version: '1.2.0' })).toMatchObject({ outcome: 'failed' });
    expect(deps.relaunch).not.toHaveBeenCalled();
    expect(await readFile(join(bundle, 'marker'), 'utf8')).toBe('old');
  });

  it('is manual not_writable when the bundle itself is read-only', async () => {
    const { deps, install } = setup();
    await chmod(bundle, 0o555);
    try {
      if (process.getuid?.() === 0) return;
      expect(await install({ version: '1.2.0' })).toMatchObject({
        reason: 'not_writable',
        note: NOT_WRITABLE_NOTE,
      });
      expect(deps.relaunch).not.toHaveBeenCalled();
    } finally {
      await chmod(bundle, 0o755);
    }
  });

  it('calls system tools by absolute path', async () => {
    const { exec, install } = setup();
    await install({ version: '1.2.0' });
    for (const [file] of exec.mock.calls) expect(file.startsWith('/')).toBe(true);
  });
});

describe('installUpdate leftovers and commit point', () => {
  const leftover = async () => {
    const asar = join(workDir(bundle), 'previous.app', 'Contents', 'Resources', 'app.asar');
    await mkdir(join(asar, '..'), { recursive: true });
    await writeFile(asar, 'old-asar');
    return join(workDir(bundle), 'previous.app');
  };

  it('installs over a non-empty previous.app left by an earlier update', async () => {
    await leftover();
    const { deps, install } = setup();
    expect(await install({ version: '1.2.0' })).toEqual({
      outcome: 'restarting',
      version: '1.2.0',
    });
    expect(await readFile(join(bundle, 'marker'), 'utf8')).toBe('new');
    expect(deps.relaunch).toHaveBeenCalledTimes(1);
  });

  it('removes the stage through the injected remover and survives its failure', async () => {
    const removeTree = vi.fn(async () => {
      throw new Error('ENOTEMPTY');
    });
    const { install } = setup({ next: ADHOC, removeTree });
    expect(await install({ version: '1.2.0' })).toMatchObject({ outcome: 'manual' });
    expect(removeTree).toHaveBeenCalledWith(
      join(workDir(bundle), 'stage'),
      expect.objectContaining({ recursive: true, force: true }),
    );
  });

  it('removes a stage holding an asar-like file with the default remover', async () => {
    const { install } = setup({ next: ADHOC });
    await install({ version: '1.2.0' });
    expect(await exists(join(workDir(bundle), 'stage'))).toBe(false);
  });

  it('returns restarting again without touching disk once installed', async () => {
    const { deps, exec, install } = setup();
    await install({ version: '1.2.0' });
    const calls = exec.mock.calls.length;
    const parked = await readFile(join(workDir(bundle), 'previous.app', 'marker'), 'utf8');
    expect(await install({ version: '1.2.0' })).toEqual({
      outcome: 'restarting',
      version: '1.2.0',
    });
    expect(deps.relaunch).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls.length).toBe(calls);
    expect(await readFile(join(bundle, 'marker'), 'utf8')).toBe('new');
    expect(await readFile(join(workDir(bundle), 'previous.app', 'marker'), 'utf8')).toBe(parked);
  });

  it('still reports restarting when the relaunch throws', async () => {
    const warn = vi.fn();
    const relaunch = () => {
      throw new Error('boom');
    };
    const { install } = setup({ relaunch, log: { log: warn } });
    expect(await install({ version: '1.2.0' })).toMatchObject({ outcome: 'restarting' });
    expect(await readFile(join(bundle, 'marker'), 'utf8')).toBe('new');
    expect(warn).toHaveBeenCalledWith('warn', 'update relaunch failed', expect.anything());
  });

  it('still reports restarting when logging the install throws', async () => {
    const log = {
      log: vi.fn((_level: string, msg: string) => {
        if (msg === 'update installed') throw new Error('log failed');
      }),
    };
    const { deps, install } = setup({ log });
    expect(await install({ version: '1.2.0' })).toMatchObject({ outcome: 'restarting' });
    expect(await readFile(join(bundle, 'marker'), 'utf8')).toBe('new');
    expect(deps.relaunch).toHaveBeenCalledTimes(1);
  });

  it('never deletes the parked running bundle in a new process', async () => {
    await setup().install({ version: '1.2.0' });
    const parked = join(workDir(bundle), 'previous.app');
    const identity = await bundleIdentity(parked);
    await writeFile(join(bundle, 'marker'), 'old');
    const { install } = setup({ identity });
    expect(await install({ version: '1.2.0' })).toMatchObject({ outcome: 'restarting' });
    expect(await exists(join(parked, 'marker'))).toBe(true);
    expect(await readFile(join(bundle, 'marker'), 'utf8')).toBe('new');
  });
});

describe('installUpdate without a matching download', () => {
  it('fails when the service has no verified download', async () => {
    const { deps } = setup();
    const install = createInstallUpdate({ ...deps, getVerifiedDownload: () => null });
    expect(await install({ version: '1.2.0' })).toMatchObject({ outcome: 'failed' });
    expect(deps.relaunch).not.toHaveBeenCalled();
  });
});
