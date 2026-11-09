import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';

/**
 * Checks that the downloaded file is a regular `.zip` inside the updates directory, resolving
 * symlinks on both sides so a `..` or link cannot escape.
 *
 * @param updatesDir - `<userData>/updates`.
 * @param filePath - Path of the downloaded zip.
 * @returns The resolved real path.
 * @throws When the file is outside the updates directory, not a regular file or not a zip.
 */
export async function assertInsideUpdates(updatesDir: string, filePath: string): Promise<string> {
  const root = (await realpath(updatesDir)) + sep;
  const real = await realpath(filePath);
  if (!real.startsWith(root)) throw new Error('Update file is outside the updates directory');
  if (!real.endsWith('.zip')) throw new Error('Update file is not a zip');
  if (!(await stat(real)).isFile()) throw new Error('Update file is not a regular file');
  return real;
}

/** SHA-256 of a file, hex, streamed. */
export function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Copies the zip into a private staging directory and re-hashes the copy, so the bytes that get
 * extracted are the bytes that were checked (no gap for a swap after verification).
 *
 * @param src - The verified zip.
 * @param stagingDir - Directory to create (mode 0700) under an existing private directory.
 * @param sha256 - Expected hash, from the signed manifest.
 * @param totalBytes - Expected size, from the signed manifest.
 * @returns Path of the staged copy.
 * @throws `Update file changed after verification` on a size or hash mismatch.
 */
export async function stageArtifact(
  src: string,
  stagingDir: string,
  sha256: string,
  totalBytes: number,
): Promise<string> {
  await mkdir(stagingDir, { mode: 0o700, recursive: true });
  const copy = join(stagingDir, 'update.zip');
  await copyFile(src, copy);
  const sizeOk = (await stat(copy)).size === totalBytes;
  if (!sizeOk || (await hashFile(copy)) !== sha256.toLowerCase()) {
    throw new Error('Update file changed after verification');
  }
  return copy;
}
