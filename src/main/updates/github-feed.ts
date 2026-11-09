import {
  FEED_TIMEOUT_MS,
  MANIFEST_MAX_BYTES,
  RELEASES_MAX_BYTES,
  RELEASES_URL,
} from './update-constants.ts';

/** The GitHub release fields the updater uses. */
export interface GithubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: { name: string; size: number; browser_download_url: string }[];
}

/** A failed feed request (HTTP status, size limit, malformed body). */
export class FeedError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNullableString = (v: unknown): v is string | null => v === null || typeof v === 'string';

function isAsset(v: unknown): v is GithubRelease['assets'][number] {
  return (
    isRecord(v) &&
    typeof v.name === 'string' &&
    typeof v.size === 'number' &&
    Number.isInteger(v.size) &&
    typeof v.browser_download_url === 'string'
  );
}

/** Type guard for the GitHub release fields the updater reads. */
export function isGithubRelease(v: unknown): v is GithubRelease {
  return (
    isRecord(v) &&
    typeof v.tag_name === 'string' &&
    isNullableString(v.name) &&
    isNullableString(v.body) &&
    typeof v.html_url === 'string' &&
    typeof v.draft === 'boolean' &&
    typeof v.prerelease === 'boolean' &&
    isNullableString(v.published_at) &&
    Array.isArray(v.assets) &&
    v.assets.every(isAsset)
  );
}

async function readText(res: Response, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res.body ?? []) {
    total += chunk.byteLength;
    if (total > limit) throw new FeedError('Feed response is too large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Requests a URL with the updater's headers and a timeout; a non-2xx status is a {@link FeedError}. */
export async function request(
  fetchFn: typeof fetch,
  url: string,
  accept: string,
  timeoutMs = FEED_TIMEOUT_MS,
): Promise<Response> {
  const res = await fetchFn(url, {
    headers: { Accept: accept, 'User-Agent': 'tajmator-updater' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new FeedError(`GitHub responded ${res.status}`);
  return res;
}

/**
 * Lists the newest releases.
 *
 * @throws {FeedError} On a non-2xx response, an oversized body or an unexpected shape.
 */
export async function fetchReleases(fetchFn: typeof fetch): Promise<GithubRelease[]> {
  const res = await request(fetchFn, RELEASES_URL, 'application/vnd.github+json');
  const data: unknown = JSON.parse(await readText(res, RELEASES_MAX_BYTES));
  if (!Array.isArray(data) || !data.every(isGithubRelease)) {
    throw new FeedError('Unexpected releases response');
  }
  return data;
}

/** Fetches an `update.json`, refusing more than {@link MANIFEST_MAX_BYTES}. */
export async function fetchManifest(fetchFn: typeof fetch, url: string): Promise<unknown> {
  const res = await request(fetchFn, url, 'application/octet-stream');
  return JSON.parse(await readText(res, MANIFEST_MAX_BYTES));
}
