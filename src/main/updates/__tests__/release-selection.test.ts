import { describe, expect, it } from 'vitest';
import {
  findAsset,
  isTrustedDownloadUrl,
  manifestArtifactName,
  pickLatestRelease,
} from '../release-selection.ts';
import { release } from './fixtures.ts';

describe('pickLatestRelease', () => {
  it('skips drafts, prereleases and non-semver tags and takes the highest version', () => {
    const picked = pickLatestRelease([
      release('v1.0.0'),
      release('v1.10.0'),
      release('v1.9.0'),
      release('v9.0.0', { draft: true }),
      release('v8.0.0', { prerelease: true }),
      release('nightly'),
    ]);
    expect(picked?.tag_name).toBe('v1.10.0');
  });

  it('returns null when nothing is eligible', () => {
    expect(pickLatestRelease([])).toBeNull();
    expect(pickLatestRelease([release('v1.0.0', { draft: true })])).toBeNull();
  });
});

describe('manifestArtifactName', () => {
  it('follows the electron-builder names per arch', () => {
    expect(manifestArtifactName('1.2.3', 'arm64')).toBe('Tajmator-1.2.3-arm64-mac.zip');
    expect(manifestArtifactName('1.2.3', 'x64')).toBe('Tajmator-1.2.3-mac.zip');
    expect(manifestArtifactName('1.2.3', 'ia32')).toBeNull();
  });
});

describe('findAsset', () => {
  const rel = release('v1.0.0', {
    assets: [
      {
        name: 'Tajmator-1.0.0-arm64-mac.zip.blockmap',
        size: 1,
        browser_download_url: 'https://github.com/a',
      },
      {
        name: 'Tajmator-1.0.0-arm64-mac.zip',
        size: 2,
        browser_download_url: 'https://github.com/b',
      },
    ],
  });

  it('matches the exact name only', () => {
    expect(findAsset(rel, 'Tajmator-1.0.0-arm64-mac.zip')?.size).toBe(2);
    expect(findAsset(rel, 'Tajmator-1.0.0-arm64-mac')).toBeUndefined();
  });
});

describe('isTrustedDownloadUrl', () => {
  it.each([
    ['https://github.com/alwatroos/tajmator/releases/download/v1/a.zip', true],
    ['https://api.github.com/repos/alwatroos/tajmator/releases/assets/1', true],
    ['https://api.github.com/repos/other/repo/releases/assets/1', false],
    ['https://api.github.com/repos/alwatroos/tajmator/releases', false],
    ['http://github.com/a', false],
    ['https://github.com.evil.example/a', false],
    ['https://evil.example/a', false],
    ['not a url', false],
  ])('%s -> %s', (url, expected) => {
    expect(isTrustedDownloadUrl(url)).toBe(expected);
  });
});
