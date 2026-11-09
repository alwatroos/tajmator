import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  GATEKEEPER_NOTE,
  type InstallUpdateManualReason,
  type InstallUpdateResult,
  NOT_PACKAGED_NOTE,
  NOT_WRITABLE_NOTE,
  SIGNATURE_MISMATCH_NOTE,
  TRANSLOCATED_NOTE,
} from '../../shared/updates.ts';
import {
  type BundleIdentity,
  defaultRm,
  isBundleReplaceable,
  isTranslocated,
  prepareWorkDir,
  type RmFn,
  runningBundle,
  swapBundle,
  workDir,
} from './bundle-swap.ts';
import {
  canSelfReplace,
  DITTO,
  type ExecFn,
  readBundleVersion,
  readSignature,
  verifyNewApp,
} from './code-signature.ts';
import { assertInsideUpdates, stageArtifact } from './staged-artifact.ts';
import { APP_NAME } from './update-constants.ts';
import type { VerifiedDownload } from './update-service.ts';

/** Minimal logger the installer writes to. */
export interface InstallLogger {
  log(level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>): void;
}

/** Everything the installer needs from the app; all injectable for tests. */
export interface InstallUpdateDeps {
  /** The service's verified download, or null when there is none to install. */
  readonly getVerifiedDownload: () => VerifiedDownload | null;
  readonly exec: ExecFn;
  /** `<userData>/updates`. */
  readonly updatesDir: string;
  /** `app.getPath('exe')`. */
  readonly exePath: string;
  readonly isPackaged: boolean;
  /** The identity of the running bundle recorded at boot, before any swap; it is never deleted. */
  readonly runningIdentity: BundleIdentity | null;
  /** `shell.showItemInFolder`. */
  readonly revealFile: (path: string) => void;
  /** Schedules `app.relaunch()` then `app.quit()` after the IPC reply. */
  readonly relaunch: () => void;
  readonly log: InstallLogger;
  /** Recursive remove for the stage; defaults to the `original-fs` backed `defaultRm`. */
  readonly removeTree?: RmFn;
}

/** The version the user saw and confirmed. */
export interface InstallUpdateRequest {
  readonly version: string;
}

/**
 * Creates the install function. A second call while one runs joins the first.
 *
 * @param deps - The app facts and side effects.
 * @returns `installUpdate(request)`, which resolves an {@link InstallUpdateResult} and never rejects.
 */
export function createInstallUpdate(
  deps: InstallUpdateDeps,
): (request: InstallUpdateRequest) => Promise<InstallUpdateResult> {
  let inFlight: Promise<InstallUpdateResult> | null = null;
  let installed: string | null = null;
  return (request) => {
    if (installed !== null) return Promise.resolve(alreadyInstalled(deps, installed));
    inFlight ??= installUpdate(deps, request)
      .then((result) => {
        if (result.outcome === 'restarting') installed = result.version;
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}

/** A swap already happened in this process: relaunch again, touch nothing on disk. */
function alreadyInstalled(deps: InstallUpdateDeps, version: string): InstallUpdateResult {
  relaunchSafely(deps);
  return { outcome: 'restarting', version };
}

/** Runs the relaunch; a failure is logged and never changes the committed outcome. */
function relaunchSafely(deps: InstallUpdateDeps): void {
  try {
    deps.relaunch();
  } catch (error) {
    safeLog(deps, 'warn', 'update relaunch failed', { error: String(error) });
  }
}

function safeLog(
  deps: InstallUpdateDeps,
  level: 'info' | 'warn',
  msg: string,
  fields: Record<string, unknown>,
): void {
  try {
    deps.log.log(level, msg, fields);
  } catch {
    // Logging must not change an outcome.
  }
}

/**
 * Installs the verified update: re-hash, extract, check signatures, swap, relaunch.
 * Unsigned situations return a manual outcome instead of replacing anything.
 *
 * @param deps - The app facts and side effects.
 * @param request - The version the user saw.
 * @returns The outcome; domain failures are `failed`, not thrown.
 */
export async function installUpdate(
  deps: InstallUpdateDeps,
  request: InstallUpdateRequest,
): Promise<InstallUpdateResult> {
  const bundle = runningBundle(deps.exePath);
  try {
    const found = deps.getVerifiedDownload();
    if (!found || found.version !== request.version) {
      return { outcome: 'failed', error: 'No verified update is ready to install' };
    }
    const file = await assertInsideUpdates(deps.updatesDir, found.filePath);
    return await installVerified(deps, bundle, { ...found, filePath: file });
  } catch (error) {
    return failed(deps, bundle, error);
  }
}

async function installVerified(
  deps: InstallUpdateDeps,
  bundle: string | null,
  update: VerifiedDownload,
): Promise<InstallUpdateResult> {
  const early = await earlyManualReason(deps, bundle);
  if (early || !bundle) return manual(deps, early ?? 'not_packaged', update.filePath);
  const work = await prepareWorkDir(bundle, deps.runningIdentity);
  const next = await extractNewApp(deps, update, work);
  const refusal = await refuseReason(deps, bundle, next, update.version);
  if (refusal) {
    await removeStage(deps, work);
    return manual(deps, refusal, update.filePath);
  }
  await swapBundle(bundle, next, work);
  // The swap is the commit point: from here on the outcome is always `restarting`.
  safeLog(deps, 'info', 'update installed', { from: bundle, to: update.version });
  relaunchSafely(deps);
  return { outcome: 'restarting', version: update.version };
}

/** Why the extracted app must not replace the running one, or null when it may. */
async function refuseReason(
  deps: InstallUpdateDeps,
  bundle: string,
  next: string,
  version: string,
): Promise<InstallUpdateManualReason | null> {
  const nextSignature = await readSignature(deps.exec, next);
  if (!nextSignature.developerId) return 'unsigned_artifact';
  const current = await readSignature(deps.exec, bundle);
  const trusted = (await verifyNewApp(deps.exec, next)) && canSelfReplace(current, nextSignature);
  if (!trusted) return 'signature_mismatch';
  if ((await readBundleVersion(deps.exec, next)) !== version) {
    throw new Error(`The update contains a different app version than ${version}`);
  }
  return null;
}

/** Decides every manual case that needs no copy or extraction. */
async function earlyManualReason(
  deps: InstallUpdateDeps,
  bundle: string | null,
): Promise<InstallUpdateManualReason | null> {
  if (!deps.isPackaged || !bundle) return 'not_packaged';
  if (isTranslocated(bundle)) return 'translocated';
  const current = await readSignature(deps.exec, bundle);
  if (!current.developerId) return 'unsigned_app';
  return (await isBundleReplaceable(bundle)) ? null : 'not_writable';
}

async function extractNewApp(
  deps: InstallUpdateDeps,
  update: VerifiedDownload,
  work: string,
): Promise<string> {
  const stage = join(work, 'stage');
  const copy = await stageArtifact(
    update.filePath,
    join(stage, 'zip'),
    update.sha256,
    update.totalBytes,
  );
  const out = join(stage, 'app');
  const result = await deps.exec(DITTO, ['-x', '-k', copy, out]);
  if (result.code !== 0) throw new Error(`Could not extract the update: ${result.stderr.trim()}`);
  const app = join(out, APP_NAME);
  if (!(await hasAppDir(app))) {
    throw new Error(`The update does not contain ${APP_NAME}`);
  }
  return app;
}

const hasAppDir = (path: string) =>
  stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );

const MANUAL_NOTES: Record<InstallUpdateManualReason, string> = {
  unsigned_app: GATEKEEPER_NOTE,
  unsigned_artifact: GATEKEEPER_NOTE,
  signature_mismatch: SIGNATURE_MISMATCH_NOTE,
  translocated: TRANSLOCATED_NOTE,
  not_writable: NOT_WRITABLE_NOTE,
  not_packaged: NOT_PACKAGED_NOTE,
};

function manual(
  deps: InstallUpdateDeps,
  reason: InstallUpdateManualReason,
  filePath: string,
): InstallUpdateResult {
  safeLog(deps, 'info', 'update install is manual', { reason });
  deps.revealFile(filePath);
  return { outcome: 'manual', reason, filePath, note: MANUAL_NOTES[reason] };
}

/** Removes `<work>/stage` through `original-fs` (asar-safe); a failure never changes the outcome. */
async function removeStage(deps: InstallUpdateDeps, work: string): Promise<void> {
  const remove = deps.removeTree ?? defaultRm;
  await remove(join(work, 'stage'), {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  }).catch(() => undefined);
}

async function failed(
  deps: InstallUpdateDeps,
  bundle: string | null,
  error: unknown,
): Promise<InstallUpdateResult> {
  const message = error instanceof Error ? error.message : String(error);
  safeLog(deps, 'warn', 'update install failed', { error: message });
  if (bundle) await removeStage(deps, workDir(bundle));
  return { outcome: 'failed', error: message };
}
