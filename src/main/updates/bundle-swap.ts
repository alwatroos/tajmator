import { randomUUID } from 'node:crypto';
import { access, constants, lstat, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** Injectable `rename`, for rollback tests. */
export type RenameFn = (from: string, to: string) => Promise<void>;

/**
 * Finds the running `.app` from the executable path (`X.app/Contents/MacOS/X`).
 *
 * @param exePath - `app.getPath('exe')`.
 * @returns The bundle path, or null when the executable is not inside a `.app`.
 */
export function runningBundle(exePath: string): string | null {
  const bundle = dirname(dirname(dirname(exePath)));
  return bundle.endsWith('.app') ? bundle : null;
}

/** True for a path macOS App Translocation mapped (a quarantined app run from a read-only copy). */
export function isTranslocated(path: string): boolean {
  return path.includes('/AppTranslocation/');
}

/** The work directory next to the bundle (same volume, so `rename` never hits EXDEV). */
export function workDir(bundle: string): string {
  return join(dirname(bundle), '.tajmator-update');
}

const writable = (path: string) =>
  access(path, constants.W_OK).then(
    () => true,
    () => false,
  );

/** True when both the bundle's parent and the bundle itself are writable (a directory move updates its `..`). */
export async function isBundleReplaceable(bundle: string): Promise<boolean> {
  return (await writable(dirname(bundle))) && (await writable(bundle));
}

/**
 * Replaces the bundle with the new app using two same-volume renames. If the second fails the
 * old bundle is moved back and the error is rethrown, so the old app stays runnable.
 *
 * @param bundle - The running bundle.
 * @param nextApp - The verified new app, inside `work`.
 * @param work - The work directory; the old bundle is parked at `<work>/previous.app`.
 * @param renameFn - Defaults to `fs.rename`.
 */
export async function swapBundle(
  bundle: string,
  nextApp: string,
  work: string,
  renameFn: RenameFn = rename,
): Promise<void> {
  const previous = join(work, 'previous.app');
  await renameFn(bundle, previous);
  try {
    await renameFn(nextApp, bundle);
  } catch (error) {
    await rollback(renameFn, previous, bundle, error);
  }
}

async function rollback(
  renameFn: RenameFn,
  previous: string,
  bundle: string,
  cause: unknown,
): Promise<never> {
  const message = cause instanceof Error ? cause.message : String(cause);
  try {
    await renameFn(previous, bundle);
  } catch {
    throw new Error(`${message}; rollback failed, the previous app is at ${previous}`);
  }
  throw cause;
}

const TRASH_PREFIX = '.tajmator-update-trash-';
const RM_OPTIONS = { recursive: true, force: true, maxRetries: 3, retryDelay: 100 } as const;

/** Directory identity (`dev`/`ino`); survives a rename, unlike a path. */
export interface BundleIdentity {
  readonly dev: number;
  readonly ino: number;
}

/** Injectable recursive remove, for failure tests. */
export type RmFn = (
  path: string,
  options: { recursive: true; force: true; maxRetries: number; retryDelay: number },
) => Promise<void>;

/** What a cleanup did: deleted paths, paths left (or moved) for later, and the last error. */
export interface LeftoverCleanup {
  readonly ok: boolean;
  readonly removed: readonly string[];
  readonly deferred: readonly string[];
  readonly error: string | null;
}

/** `stat(bundle)` dev/ino, or null when it cannot be read. Never throws. */
export async function bundleIdentity(bundle: string): Promise<BundleIdentity | null> {
  return identityOf(bundle);
}

async function identityOf(path: string): Promise<BundleIdentity | null> {
  try {
    const { dev, ino } = await lstat(path);
    return { dev, ino };
  } catch {
    return null;
  }
}

/** A trash directory beside the bundle (same volume), for leftovers that cannot be deleted. */
export function trashDir(bundle: string, id: string): string {
  return join(dirname(bundle), `${TRASH_PREFIX}${id}`);
}

/**
 * Removes through Electron's `original-fs`, where `.asar` files are plain files; Electron's patched
 * `fs` treats them as virtual directories, so a recursive remove leaves them behind (ENOTEMPTY).
 * Outside Electron `original-fs` does not exist and the normal `fs.promises.rm` is used.
 */
export const defaultRm: RmFn = (path, options) => {
  try {
    const original = createRequire(import.meta.url)('original-fs') as { promises?: { rm: RmFn } };
    if (original.promises) return original.promises.rm(path, options);
  } catch {
    // not running under Electron
  }
  return rm(path, options);
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function exists(path: string): Promise<boolean> {
  return (await identityOf(path)) !== null;
}

const same = (a: BundleIdentity | null, b: BundleIdentity | null) =>
  a !== null && b !== null && a.dev === b.dev && a.ino === b.ino;

async function isProtected(target: string, running: BundleIdentity | null): Promise<boolean> {
  if (running === null) return false;
  return (
    same(running, await identityOf(target)) ||
    same(running, await identityOf(join(target, 'previous.app')))
  );
}

async function trashSiblings(bundle: string): Promise<string[]> {
  const names = await readdir(dirname(bundle)).catch(() => [] as string[]);
  return names.filter((n) => n.startsWith(TRASH_PREFIX)).map((n) => join(dirname(bundle), n));
}

async function moveAside(bundle: string, renameFn: RenameFn): Promise<string> {
  const target = trashDir(bundle, randomUUID());
  await renameFn(workDir(bundle), target);
  return target;
}

/**
 * Prepares an empty, private work directory. A leftover is removed, else (or when it holds the
 * running bundle) renamed aside, never deleted if it is the running bundle.
 *
 * @param bundle - The running bundle.
 * @param running - Identity recorded at boot, or null.
 * @returns The fresh work directory. Rejects only when removal and rename both fail.
 */
export async function prepareWorkDir(
  bundle: string,
  running: BundleIdentity | null,
  rmFn: RmFn = defaultRm,
  renameFn: RenameFn = rename,
): Promise<string> {
  const work = workDir(bundle);
  if (await exists(work)) {
    const guarded = await isProtected(work, running);
    const removed =
      !guarded &&
      (await rmFn(work, RM_OPTIONS).then(
        () => true,
        () => false,
      ));
    if (!removed) await moveAside(bundle, renameFn);
  }
  await mkdir(work, { mode: 0o700 });
  return work;
}

async function cleanTarget(
  bundle: string,
  target: string,
  rmFn: RmFn,
  renameFn: RenameFn,
  out: { removed: string[]; deferred: string[]; error: string | null },
): Promise<void> {
  try {
    await rmFn(target, RM_OPTIONS);
    out.removed.push(target);
  } catch (error) {
    out.error = message(error);
    if (target !== workDir(bundle)) return void out.deferred.push(target);
    try {
      out.deferred.push(await moveAside(bundle, renameFn));
    } catch (e) {
      out.error = message(e);
    }
  }
}

/**
 * Removes the work directory and every trash sibling, never the running bundle. A work directory
 * that cannot be removed is renamed aside so the next install is not blocked. Never throws.
 *
 * @param bundle - The running bundle.
 * @param running - Identity recorded at boot, or null.
 * @returns `ok` is true when the work directory no longer exists.
 */
export async function cleanLeftovers(
  bundle: string,
  running: BundleIdentity | null,
  rmFn: RmFn = defaultRm,
  renameFn: RenameFn = rename,
): Promise<LeftoverCleanup> {
  const out = { removed: [] as string[], deferred: [] as string[], error: null as string | null };
  const targets = [workDir(bundle), ...(await trashSiblings(bundle))];
  for (const target of targets) {
    if (!(await exists(target))) continue;
    if (await isProtected(target, running)) out.deferred.push(target);
    else await cleanTarget(bundle, target, rmFn, renameFn, out);
  }
  return { ok: !(await exists(workDir(bundle))), ...out };
}
