import type { GithubRelease } from './github-feed.ts';
import { compareVersions, parseVersion } from './semver.ts';
import { DOWNLOAD_ORIGIN, GITHUB_API_ORIGIN, UPDATE_REPOSITORY } from './update-constants.ts';

/**
 * Picks the newest stable release: drafts, prereleases and non-semver tags are dropped.
 *
 * @param releases - Releases from the feed.
 * @returns The highest-versioned release, or null.
 */
export function pickLatestRelease(releases: GithubRelease[]): GithubRelease | null {
  const eligible = releases
    .filter((r) => !r.draft && !r.prerelease)
    .flatMap((release) => {
      const version = parseVersion(release.tag_name);
      return version ? [{ release, version }] : [];
    });
  eligible.sort((a, b) => compareVersions(b.version, a.version));
  return eligible[0]?.release ?? null;
}

/**
 * The artifact name electron-builder writes into `update.json`.
 *
 * @param version - Version without `v`.
 * @param arch - Node architecture of the running app.
 * @returns The `.zip` name, or null for an unsupported architecture.
 */
export function manifestArtifactName(version: string, arch: NodeJS.Architecture): string | null {
  if (arch === 'arm64') return `Tajmator-${version}-arm64-mac.zip`;
  if (arch === 'x64') return `Tajmator-${version}-mac.zip`;
  return null;
}

/** Finds the release asset with exactly this name, never a substring match. */
export function findAsset(
  release: GithubRelease,
  name: string,
): GithubRelease['assets'][number] | undefined {
  return release.assets.find((a) => a.name === name);
}

/**
 * Whether an asset URL may be fetched: `https://github.com`, or this repository's asset
 * endpoint on `api.github.com`.
 */
export function isTrustedDownloadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.origin === DOWNLOAD_ORIGIN) return true;
    return (
      parsed.origin === GITHUB_API_ORIGIN &&
      parsed.pathname.startsWith(`/repos/${UPDATE_REPOSITORY}/releases/assets/`)
    );
  } catch {
    return false;
  }
}
