import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** A download that failed its size or sha256 check, or could not start. */
export class DownloadError extends Error {}

/** Input of {@link downloadArtifact}. */
export interface DownloadRequest {
  readonly dest: string;
  readonly name: string;
  readonly size: number;
  readonly sha256: string;
  /** Opens the artifact's response (redirects and the token policy are the caller's). */
  readonly open: () => Promise<Response>;
  readonly onProgress: (bytes: number) => void;
}

/** Counts and hashes bytes as they pass, aborting once more than `size` arrive. */
async function* measure(
  source: AsyncIterable<Buffer>,
  size: number,
  hash: ReturnType<typeof createHash>,
  state: { bytes: number },
  onProgress: (bytes: number) => void,
): AsyncGenerator<Buffer> {
  for await (const chunk of source) {
    state.bytes += chunk.length;
    if (state.bytes > size) throw new DownloadError('Download is larger than the manifest says');
    hash.update(chunk);
    onProgress(state.bytes);
    yield chunk;
  }
}

/** Streams the response into `part` and checks size and sha256. */
async function streamToPart(req: DownloadRequest, part: string): Promise<void> {
  const res = await req.open();
  if (!res.ok || !res.body) throw new DownloadError(`Download responded ${res.status}`);
  const hash = createHash('sha256');
  const state = { bytes: 0 };
  const body = Readable.fromWeb(res.body as never) as AsyncIterable<Buffer>;
  await pipeline(measure(body, req.size, hash, state, req.onProgress), createWriteStream(part));
  if (state.bytes !== req.size || hash.digest('hex') !== req.sha256)
    throw new DownloadError(`${req.name} does not match the manifest`);
}

/**
 * Streams an artifact to `<dest>.part`, checks size and sha256 against the manifest
 * values and renames it to `dest`. Any failure deletes the partial file.
 *
 * @throws {DownloadError} When the response or the content does not match the manifest.
 */
export async function downloadArtifact(req: DownloadRequest): Promise<void> {
  const part = `${req.dest}.part`;
  await mkdir(dirname(req.dest), { recursive: true });
  try {
    await streamToPart(req, part);
    await rename(part, req.dest);
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}

/** Removes every `<updatesDir>/<tag>` directory except the one to keep. */
export async function pruneOtherUpdates(updatesDir: string, keepTag: string): Promise<void> {
  const entries = await readdir(updatesDir).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((entry) => entry !== keepTag)
      .map((entry) => rm(join(updatesDir, entry), { recursive: true, force: true })),
  );
}
