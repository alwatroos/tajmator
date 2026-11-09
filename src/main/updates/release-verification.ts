import { fetchManifest, type GithubRelease } from './github-feed.ts';
import { findAsset, isTrustedDownloadUrl, manifestArtifactName } from './release-selection.ts';
import { verifyUpdateManifest } from './update-manifest.ts';

/** What a successful verification proved and the download needs. */
export interface VerifiedTarget {
  readonly tag: string;
  readonly artifact: { name: string; size: number; sha256: string };
  readonly url: string;
}

/** Either why a release cannot be offered, or the verified download target. */
export type VerifyOutcome = { reason: string } | { target: VerifiedTarget };

/** Trust anchors of a verification. */
export interface VerifyOptions {
  /** Base64 SPKI of the key `update.json` must be signed with. */
  readonly publicKey: string;
  readonly arch: NodeJS.Architecture;
}

/**
 * Fetches the release's `update.json`, verifies it and matches the running
 * architecture's zip against the manifest and the GitHub asset.
 *
 * @returns The download target, or the reason the release is unverifiable.
 */
export async function verifyRelease(
  fetchFn: typeof fetch,
  release: GithubRelease,
  options: VerifyOptions,
): Promise<VerifyOutcome> {
  const manifestAsset = findAsset(release, 'update.json');
  if (!manifestAsset || !isTrustedDownloadUrl(manifestAsset.browser_download_url)) {
    return { reason: 'release has no update.json' };
  }
  const raw = await fetchManifest(fetchFn, manifestAsset.browser_download_url);
  const verified = verifyUpdateManifest(raw, options.publicKey, release);
  if (!verified.ok) return { reason: verified.reason };
  const name = manifestArtifactName(release.tag_name.replace(/^v/, ''), options.arch);
  const artifact = verified.manifest.artifacts.find((a) => a.name === name);
  if (!artifact) return { reason: 'manifest has no artifact for this architecture' };
  const asset = findAsset(release, artifact.name);
  if (!asset || asset.size !== artifact.size) {
    return { reason: 'release asset does not match the manifest' };
  }
  if (!isTrustedDownloadUrl(asset.browser_download_url)) {
    return { reason: 'download URL is not trusted' };
  }
  return { target: { tag: release.tag_name, artifact, url: asset.browser_download_url } };
}
