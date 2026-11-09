import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { downloadArtifact } from '../artifact-download.ts';

const body = Buffer.alloc(200_000, 7);
const sha = createHash('sha256').update(body).digest('hex');
let server: Server;
let url: string;
let dir: string;
let payload = body;

beforeEach(async () => {
  payload = body;
  dir = mkdtempSync(join(tmpdir(), 'tj-dl-'));
  server = createServer((_req, res) => res.end(payload));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/a.zip`;
});
afterEach(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const run = (over: object = {}, progress: number[] = []) =>
  downloadArtifact({
    dest: join(dir, 'tag', 'a.zip'),
    name: 'a.zip',
    size: body.length,
    sha256: sha,
    open: () => fetch(url),
    onProgress: (b) => progress.push(b),
    ...over,
  });

describe('downloadArtifact', () => {
  it('writes the file, reports progress and leaves no .part', async () => {
    const progress: number[] = [];
    await run({}, progress);
    expect(readFileSync(join(dir, 'tag', 'a.zip')).equals(body)).toBe(true);
    expect(progress.at(-1)).toBe(body.length);
    expect(existsSync(join(dir, 'tag', 'a.zip.part'))).toBe(false);
  });

  it('deletes the file on a sha256 mismatch', async () => {
    await expect(run({ sha256: 'a'.repeat(64) })).rejects.toThrow(
      'a.zip does not match the manifest',
    );
    expect(existsSync(join(dir, 'tag', 'a.zip'))).toBe(false);
    expect(existsSync(join(dir, 'tag', 'a.zip.part'))).toBe(false);
  });

  it('aborts and deletes an oversize body', async () => {
    payload = Buffer.alloc(body.length + 1000, 7);
    await expect(run()).rejects.toThrow('larger');
    expect(existsSync(join(dir, 'tag', 'a.zip.part'))).toBe(false);
  });

  it('rejects a short body', async () => {
    payload = body.subarray(0, 1000);
    await expect(run()).rejects.toThrow('does not match');
  });
});
