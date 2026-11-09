import { createPublicKey, verify } from 'node:crypto';
import type { GithubRelease } from './github-feed.ts';

/** The signed `update.json` written by `.github/scripts/update-manifest.mjs`. */
export interface UpdateManifest {
  version: string;
  tag: string;
  published: string;
  artifacts: { name: string; size: number; sha256: string }[];
  publicKey: string;
  signature: string;
}

/** Outcome of {@link verifyUpdateManifest}. */
export type ManifestVerification =
  | { ok: true; manifest: UpdateManifest }
  | { ok: false; reason: string };

function isArtifact(v: unknown): v is UpdateManifest['artifacts'][number] {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.name === 'string' &&
    typeof a.size === 'number' &&
    Number.isInteger(a.size) &&
    a.size >= 0 &&
    typeof a.sha256 === 'string'
  );
}

/** Type guard for the manifest's shape (not its signature). */
export function isUpdateManifest(v: unknown): v is UpdateManifest {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.version === 'string' &&
    typeof m.tag === 'string' &&
    typeof m.published === 'string' &&
    Array.isArray(m.artifacts) &&
    m.artifacts.every(isArtifact) &&
    typeof m.publicKey === 'string' &&
    typeof m.signature === 'string'
  );
}

/** The exact bytes that are signed; mirrors `canonicalPayload` in update-manifest.mjs. */
export function canonicalPayload(m: UpdateManifest): Buffer {
  const { version, tag, published, artifacts, publicKey } = m;
  return Buffer.from(JSON.stringify({ version, tag, published, artifacts, publicKey }));
}

/** SPKI DER bytes of a base64 SPKI public key. */
function spki(base64: string): Buffer {
  const key = createPublicKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'spki' });
  return key.export({ format: 'der', type: 'spki' });
}

/** Checks pinned key, signature and version/tag; throws on malformed key material. */
function check(m: UpdateManifest, pinnedKey: string, release: GithubRelease): string | null {
  const embedded = createPublicKey({
    key: Buffer.from(m.publicKey, 'base64'),
    format: 'der',
    type: 'spki',
  });
  if (!spki(pinnedKey).equals(embedded.export({ format: 'der', type: 'spki' })))
    return 'public key mismatch';
  if (!verify(null, canonicalPayload(m), embedded, Buffer.from(m.signature, 'base64')))
    return 'signature does not verify';
  const tagVersion = release.tag_name.replace(/^v/, '');
  if (m.version !== tagVersion || m.tag !== release.tag_name) return 'version mismatch';
  return null;
}

/**
 * Verifies a manifest against the pinned key and the release it came with. Never throws.
 *
 * @param raw - Parsed JSON of `update.json`.
 * @param pinnedKey - Base64 SPKI of the trusted publisher key.
 * @param release - The GitHub release the manifest was attached to.
 */
export function verifyUpdateManifest(
  raw: unknown,
  pinnedKey: string,
  release: GithubRelease,
): ManifestVerification {
  if (!isUpdateManifest(raw)) return { ok: false, reason: 'invalid manifest' };
  try {
    const reason = check(raw, pinnedKey, release);
    return reason ? { ok: false, reason } : { ok: true, manifest: raw };
  } catch {
    return { ok: false, reason: 'invalid manifest' };
  }
}
