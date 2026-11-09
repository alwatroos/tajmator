/** Base64 SPKI DER of Tajmator's own Ed25519 key that signs every release's `update.json`. */
export const UPDATE_PUBLIC_KEY = 'MCowBQYDK2VwAyEAZmRgRtM65dYbvG2/nZsKNwMJI/pVfvV/9hEGaw25EJ4=';

/** The GitHub repository releases are read from. */
export const UPDATE_REPOSITORY = 'alwatroos/tajmator';

/** Releases API URL (the repository is public, so no token is used). */
export const RELEASES_URL = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases?per_page=30`;

/** Origin of public release asset downloads. */
export const DOWNLOAD_ORIGIN = 'https://github.com';

/** Origin of the GitHub API. */
export const GITHUB_API_ORIGIN = 'https://api.github.com';

/** Pause between two scheduled checks. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 3600_000;

/** Delay before the first check after the app starts. */
export const UPDATE_STARTUP_DELAY_MS = 10_000;

/** Timeout of every feed request. */
export const FEED_TIMEOUT_MS = 15_000;

/** Largest `update.json` that is read. */
export const MANIFEST_MAX_BYTES = 65_536;

/** Largest releases listing that is read. */
export const RELEASES_MAX_BYTES = 5_000_000;

/** Minimum pause between two download progress updates. */
export const PROGRESS_INTERVAL_MS = 250;

/** Longest an artifact download may take. */
export const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;

/** Name of the app bundle inside the update zip. */
export const APP_NAME = 'Tajmator.app';
