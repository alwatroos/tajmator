import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { assertInsideUpdates, stageArtifact } from '../staged-artifact.ts';

let home = '';
let outside = '';
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'tj-home-'));
  outside = await mkdtemp(join(tmpdir(), 'tj-out-'));
  await mkdir(join(home, 'updates', 'v1'), { recursive: true });
});

describe('assertInsideUpdates', () => {
  it('accepts a zip inside updates', async () => {
    const file = join(home, 'updates', 'v1', 'a.zip');
    await writeFile(file, 'x');
    expect(await assertInsideUpdates(join(home, 'updates'), file)).toMatch(/a\.zip$/);
  });

  it('rejects outside, .. escapes, symlinks and non-zip files', async () => {
    await writeFile(join(outside, 'b.zip'), 'x');
    await expect(
      assertInsideUpdates(join(home, 'updates'), join(outside, 'b.zip')),
    ).rejects.toThrow('outside');
    await expect(
      assertInsideUpdates(
        join(home, 'updates'),
        join(home, 'updates', '..', '..', outside, 'b.zip'),
      ),
    ).rejects.toThrow();
    await symlink(join(outside, 'b.zip'), join(home, 'updates', 'link.zip'));
    await expect(
      assertInsideUpdates(join(home, 'updates'), join(home, 'updates', 'link.zip')),
    ).rejects.toThrow('outside');
    await writeFile(join(home, 'updates', 'v1', 'a.txt'), 'x');
    await expect(
      assertInsideUpdates(join(home, 'updates'), join(home, 'updates', 'v1', 'a.txt')),
    ).rejects.toThrow('not a zip');
  });
});

describe('stageArtifact', () => {
  const sha = createHash('sha256').update('data').digest('hex');

  it('copies and verifies the copy', async () => {
    const src = join(home, 'updates', 'v1', 'a.zip');
    await writeFile(src, 'data');
    const copy = await stageArtifact(src, join(outside, 'stage'), sha, 4);
    expect(await readFile(copy, 'utf8')).toBe('data');
  });

  it('rejects a hash or size mismatch', async () => {
    const src = join(home, 'updates', 'v1', 'a.zip');
    await writeFile(src, 'data');
    await expect(stageArtifact(src, join(outside, 's1'), 'f'.repeat(64), 4)).rejects.toThrow(
      'changed after verification',
    );
    await expect(stageArtifact(src, join(outside, 's2'), sha, 5)).rejects.toThrow(
      'changed after verification',
    );
  });
});
