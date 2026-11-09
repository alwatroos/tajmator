import { join } from 'node:path';
import type { UpdateStatus } from '../../shared/updates.ts';
import { type DownloadRequest, downloadArtifact, pruneOtherUpdates } from './artifact-download.ts';
import { fetchReleases, type GithubRelease, request } from './github-feed.ts';
import { pickLatestRelease } from './release-selection.ts';
import { type VerifiedTarget, verifyRelease } from './release-verification.ts';
import { compareVersions, parseVersion } from './semver.ts';
import {
  DOWNLOAD_TIMEOUT_MS,
  PROGRESS_INTERVAL_MS,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_PUBLIC_KEY,
  UPDATE_STARTUP_DELAY_MS,
} from './update-constants.ts';

/** Dependencies of {@link UpdateService}; every side effect is injected. */
export interface UpdateServiceDeps {
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly currentVersion: string;
  readonly arch: NodeJS.Architecture;
  /** `<userData>/updates`. */
  readonly updatesDir: string;
  readonly setTimeout: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  /** Base64 SPKI key manifests must be signed with; defaults to the pinned key. */
  readonly publicKey?: string;
}

/** A downloaded and verified update zip. */
export interface VerifiedDownload {
  readonly version: string;
  readonly filePath: string;
  readonly sha256: string;
  readonly totalBytes: number;
}

type Listener = (status: UpdateStatus) => void;

/** Status fields shared by every outcome that offers nothing. */
const NOTHING = { unverifiableReason: null, download: null } as const;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Checks GitHub for a newer signed release and downloads it after verification. Never throws. */
export class UpdateService {
  readonly #deps: UpdateServiceDeps;
  readonly #listeners = new Set<Listener>();
  #status: UpdateStatus;
  #target: VerifiedTarget | null = null;
  #verified: VerifiedDownload | null = null;
  #checking: Promise<UpdateStatus> | null = null;
  #downloading: Promise<UpdateStatus> | null = null;
  #timer: unknown = null;
  #running = false;

  /** @param deps - Version, paths, clock, timers and fetch. */
  constructor(deps: UpdateServiceDeps) {
    this.#deps = deps;
    this.#status = {
      phase: 'idle',
      currentVersion: deps.currentVersion,
      checkedAt: null,
      release: null,
      download: null,
      unverifiableReason: null,
      error: null,
    };
  }

  /** The current update state. */
  getStatus(): UpdateStatus {
    return this.#status;
  }

  /** The verified zip on disk, only while the phase is `verified` or `installing`. */
  getVerifiedDownload(): VerifiedDownload | null {
    const { phase } = this.#status;
    return phase === 'verified' || phase === 'installing' ? this.#verified : null;
  }

  /** Subscribes to status changes. @returns the unsubscribe function. */
  onChange(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Schedules the first check after a short delay, then one every 6 hours. */
  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#schedule(UPDATE_STARTUP_DELAY_MS);
  }

  /** Cancels the schedule. */
  stop(): void {
    this.#running = false;
    if (this.#timer !== null) this.#deps.clearTimeout(this.#timer);
    this.#timer = null;
  }

  /** Marks an install as running (`installing`) or finished without a restart (`verified`). */
  setInstalling(active: boolean): void {
    const { phase } = this.#status;
    if (active && phase === 'verified') this.#set({ phase: 'installing' });
    else if (!active && phase === 'installing') this.#set({ phase: 'verified' });
  }

  /** Runs a check now; a check already running is joined. Never rejects. */
  check(): Promise<UpdateStatus> {
    const { phase } = this.#status;
    if (phase === 'downloading' || phase === 'installing') return Promise.resolve(this.#status);
    this.#checking ??= this.#runCheck().finally(() => {
      this.#checking = null;
    });
    return this.#checking;
  }

  /**
   * Downloads the verified update's zip; only from `available`. Resolves when the download
   * finished or failed, with the status at that point. Never rejects.
   */
  download(): Promise<UpdateStatus> {
    if (this.#downloading) return this.#downloading;
    const target = this.#target;
    if (this.#status.phase !== 'available' || !target) return Promise.resolve(this.#status);
    this.#set({ phase: 'downloading', error: null, download: progress(target, 0) });
    this.#downloading = this.#runDownload(target).finally(() => {
      this.#downloading = null;
    });
    return this.#downloading;
  }

  #schedule(ms: number): void {
    this.#timer = this.#deps.setTimeout(() => {
      this.#timer = null;
      void this.check().finally(() => {
        if (this.#running) this.#schedule(UPDATE_CHECK_INTERVAL_MS);
      });
    }, ms);
  }

  async #runCheck(): Promise<UpdateStatus> {
    const keep = this.#status.phase === 'verified';
    if (!keep) this.#set({ phase: 'checking', error: null });
    try {
      const release = pickLatestRelease(await fetchReleases(this.#deps.fetch));
      const outcome = await this.#evaluate(release);
      this.#finishCheck(outcome, keep);
    } catch (error) {
      this.#failCheck(error, keep);
    }
    return this.#status;
  }

  /** A failed re-check never discards a verified download; otherwise the status is `failed`. */
  #failCheck(error: unknown, keep: boolean): void {
    console.warn('update check failed', messageOf(error));
    if (keep) this.#set({ checkedAt: this.#now() });
    else
      this.#set({
        phase: 'failed',
        error: messageOf(error),
        download: null,
        checkedAt: this.#now(),
      });
  }

  /** Applies a check result; a finished download of the same tag stays `verified`. */
  #finishCheck(outcome: Evaluation, keep: boolean): void {
    if (keep && outcome.target?.tag === this.#status.release?.tag) {
      this.#set({ checkedAt: this.#now() });
      return;
    }
    this.#target = outcome.target;
    this.#verified = null;
    this.#set({ ...outcome.patch, checkedAt: this.#now() });
  }

  async #evaluate(release: GithubRelease | null): Promise<Evaluation> {
    const current = parseVersion(this.#deps.currentVersion);
    if (!current) throw new Error('Current version unknown');
    const latest = release ? parseVersion(release.tag_name) : null;
    if (!release || !latest || compareVersions(latest, current) <= 0) {
      const info = release ? toRelease(release) : null;
      return {
        patch: { ...NOTHING, release: info, phase: 'up_to_date', error: null },
        target: null,
      };
    }
    const info = toRelease(release);
    const outcome = await verifyRelease(this.#deps.fetch, release, {
      publicKey: this.#deps.publicKey ?? UPDATE_PUBLIC_KEY,
      arch: this.#deps.arch,
    });
    if ('reason' in outcome) {
      const patch = { ...NOTHING, release: info, phase: 'unverifiable', error: null } as const;
      return { patch: { ...patch, unverifiableReason: outcome.reason }, target: null };
    }
    const patch = { ...NOTHING, release: info, phase: 'available', error: null } as const;
    return { patch, target: outcome.target };
  }

  async #runDownload(target: VerifiedTarget): Promise<UpdateStatus> {
    const dest = join(this.#deps.updatesDir, target.tag, target.artifact.name);
    try {
      await pruneOtherUpdates(this.#deps.updatesDir, target.tag);
      await downloadArtifact(this.#request(target, dest));
      this.#verified = {
        version: target.tag.replace(/^v/, ''),
        filePath: dest,
        sha256: target.artifact.sha256,
        totalBytes: target.artifact.size,
      };
      this.#set({ phase: 'verified', download: progress(target, target.artifact.size) });
    } catch (error) {
      console.warn('update download failed', messageOf(error));
      this.#set({ phase: 'failed', error: messageOf(error), download: null });
    }
    return this.#status;
  }

  #request(target: VerifiedTarget, dest: string): DownloadRequest {
    let last = 0;
    const { name, size, sha256 } = target.artifact;
    const onProgress = (bytes: number): void => {
      const at = this.#deps.now().getTime();
      if (at - last < PROGRESS_INTERVAL_MS) return;
      last = at;
      this.#set({ download: progress(target, bytes) });
    };
    const open = (): Promise<Response> =>
      request(this.#deps.fetch, target.url, 'application/octet-stream', DOWNLOAD_TIMEOUT_MS);
    return { dest, name, size, sha256, open, onProgress };
  }

  #now(): string {
    return this.#deps.now().toISOString();
  }

  #set(patch: Partial<UpdateStatus>): void {
    this.#status = { ...this.#status, ...patch };
    for (const listener of this.#listeners) {
      try {
        listener(this.#status);
      } catch (error) {
        console.warn('update listener failed', messageOf(error));
      }
    }
  }
}

/** Outcome of evaluating a release: a status patch plus the download target if verified. */
interface Evaluation {
  readonly patch: Partial<UpdateStatus>;
  readonly target: VerifiedTarget | null;
}

function progress(target: VerifiedTarget, bytes: number): UpdateStatus['download'] {
  return { bytes, totalBytes: target.artifact.size };
}

/** Maps a GitHub release to the status DTO. */
function toRelease(r: GithubRelease): NonNullable<UpdateStatus['release']> {
  return {
    version: r.tag_name.replace(/^v/, ''),
    tag: r.tag_name,
    htmlUrl: r.html_url,
    notes: r.body ?? '',
  };
}
