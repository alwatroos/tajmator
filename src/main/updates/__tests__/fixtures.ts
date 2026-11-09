import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import type { GithubRelease } from '../github-feed.ts';
import { manifestArtifactName } from '../release-selection.ts';
import { canonicalPayload, type UpdateManifest } from '../update-manifest.ts';

/** A throwaway Ed25519 key pair; `publicKey` is base64 SPKI like the pinned key. */
export function makeKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateKey,
  };
}

export type Keys = ReturnType<typeof makeKeys>;

export const sha256 = (data: Buffer | string): string =>
  createHash('sha256').update(data).digest('hex');

/** A signed manifest for `version` with one artifact per name. */
export function signedManifest(
  keys: Keys,
  version: string,
  artifacts: { name: string; size: number; sha256: string }[],
): UpdateManifest {
  const unsigned = {
    version,
    tag: `v${version}`,
    published: '2026-01-01T00:00:00.000Z',
    artifacts,
    publicKey: keys.publicKey,
    signature: '',
  };
  const signature = sign(null, canonicalPayload(unsigned), keys.privateKey).toString('base64');
  return { ...unsigned, signature };
}

/** A GitHub release with the given asset names. */
export function release(tag: string, over: Partial<GithubRelease> = {}): GithubRelease {
  return {
    tag_name: tag,
    name: tag,
    body: 'notes',
    html_url: `https://github.com/alwatroos/tajmator/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    published_at: '2026-01-01T00:00:00Z',
    assets: [],
    ...over,
  };
}

/** A release with `update.json` and the arm64 zip, plus the zip bytes and the manifest. */
export function fullRelease(
  keys: Keys,
  version: string,
  zip: Buffer,
  arch: 'arm64' | 'x64' = 'arm64',
) {
  const name = manifestArtifactName(version, arch) as string;
  const manifest = signedManifest(keys, version, [{ name, size: zip.length, sha256: sha256(zip) }]);
  const base = `https://github.com/alwatroos/tajmator/releases/download/v${version}`;
  const rel = release(`v${version}`, {
    assets: [
      { name: 'update.json', size: 100, browser_download_url: `${base}/update.json` },
      { name, size: zip.length, browser_download_url: `${base}/${name}` },
    ],
  });
  return { rel, manifest, name, zipUrl: `${base}/${name}`, manifestUrl: `${base}/update.json` };
}
