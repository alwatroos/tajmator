#!/usr/bin/env node
// Builds, signs and verifies the release update manifest (`update.json`). Dependency-free (node:crypto, node:fs).
//
//   node update-manifest.mjs sign   --tag vX.Y.Z --artifacts DIR --published ISO --key-file FILE --out FILE
//   node update-manifest.mjs verify FILE [--public-key FILE]
//
// The signed payload is canonical JSON of { version, tag, published, artifacts, publicKey } in that key order; the
// manifest is that object plus `signature` (base64 Ed25519). `publicKey` is the base64 SPKI DER of the signing key, so
// `verify` alone proves integrity; pass --public-key (base64 or PEM SPKI) to pin the expected publisher key.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ARTIFACT = /\.(dmg|zip|exe|AppImage)$/;
const SEMVER = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

/**
 * Parse an Ed25519 private key given as PEM PKCS8, base64 of that PEM, or base64 of the PKCS8 DER.
 * @param {string} text
 * @returns {import('node:crypto').KeyObject}
 */
export function parsePrivateKey(text) {
  const t = text.trim();
  if (t.startsWith('-----BEGIN')) return createPrivateKey(t);
  const raw = Buffer.from(t, 'base64');
  if (raw.subarray(0, 10).toString() === '-----BEGIN') return createPrivateKey(raw.toString());
  return createPrivateKey({ key: raw, format: 'der', type: 'pkcs8' });
}

/**
 * Parse a public key given as PEM SPKI or base64 SPKI DER.
 * @param {string} text
 * @returns {import('node:crypto').KeyObject}
 */
export function parsePublicKey(text) {
  const t = text.trim();
  if (t.startsWith('-----BEGIN')) return createPublicKey(t);
  return createPublicKey({ key: Buffer.from(t, 'base64'), format: 'der', type: 'spki' });
}

/**
 * Name, size and sha256 of every release artifact in a directory, sorted by name.
 * @param {string} dir
 * @returns {{ name: string, size: number, sha256: string }[]}
 */
export function describeArtifacts(dir) {
  const names = readdirSync(dir).filter((n) => ARTIFACT.test(n) && statSync(join(dir, n)).isFile());
  if (names.length === 0) throw new Error(`no release artifacts in ${dir}`);
  return names.sort().map((name) => {
    const data = readFileSync(join(dir, name));
    return { name, size: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  });
}

/**
 * The exact bytes that are signed.
 * @param {{ version: string, tag: string, published: string, artifacts: unknown[], publicKey: string }} m
 * @returns {Buffer}
 */
export function canonicalPayload(m) {
  const { version, tag, published, artifacts, publicKey } = m;
  return Buffer.from(JSON.stringify({ version, tag, published, artifacts, publicKey }));
}

/**
 * Build and sign a manifest.
 * @param {{ tag: string, artifactsDir: string, published: string, privateKey: import('node:crypto').KeyObject }} o
 * @returns {object}
 */
export function buildManifest({ tag, artifactsDir, published, privateKey }) {
  const match = SEMVER.exec(tag);
  if (!match) throw new Error(`tag ${tag} is not vX.Y.Z[-pre]`);
  if (Number.isNaN(Date.parse(published)))
    throw new Error(`published ${published} is not a timestamp`);
  const publicKey = createPublicKey(privateKey)
    .export({ format: 'der', type: 'spki' })
    .toString('base64');
  const body = {
    version: match[1],
    tag,
    published,
    artifacts: describeArtifacts(artifactsDir),
    publicKey,
  };
  const signature = sign(null, canonicalPayload(body), privateKey).toString('base64');
  return { ...body, signature };
}

/**
 * Verify a manifest signature, optionally against a pinned public key. Throws on any failure.
 * @param {any} m
 * @param {string} [pinned]
 * @returns {void}
 */
export function verifyManifest(m, pinned) {
  for (const k of ['version', 'tag', 'published', 'artifacts', 'publicKey', 'signature']) {
    if (m?.[k] === undefined) throw new Error(`manifest has no ${k}`);
  }
  const embedded = parsePublicKey(m.publicKey);
  if (pinned !== undefined) {
    const want = parsePublicKey(pinned).export({ format: 'der', type: 'spki' });
    if (!want.equals(embedded.export({ format: 'der', type: 'spki' })))
      throw new Error('public key mismatch');
  }
  if (!verify(null, canonicalPayload(m), embedded, Buffer.from(m.signature, 'base64'))) {
    throw new Error('signature does not verify');
  }
}

/**
 * Check every listed artifact in a directory against its size and sha256.
 * @param {any} m
 * @param {string} dir
 * @returns {void}
 */
export function verifyArtifacts(m, dir) {
  for (const a of m.artifacts) {
    const data = readFileSync(join(dir, a.name));
    const sha = createHash('sha256').update(data).digest('hex');
    if (data.length !== a.size || sha !== a.sha256)
      throw new Error(`${a.name} does not match the manifest`);
  }
}

/**
 * Read `--name value` options.
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
function options(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1];
  return o;
}

/**
 * CLI entry.
 * @param {string[]} argv
 * @returns {void}
 */
function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'sign') {
    const o = options(rest);
    for (const k of ['tag', 'artifacts', 'published', 'key-file', 'out']) {
      if (!o[k]) throw new Error(`missing --${k}`);
    }
    const privateKey = parsePrivateKey(readFileSync(o['key-file'], 'utf8'));
    const manifest = buildManifest({
      tag: o.tag,
      artifactsDir: o.artifacts,
      published: o.published,
      privateKey,
    });
    writeFileSync(o.out, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`update-manifest: signed ${manifest.artifacts.length} artifact(s) for ${o.tag}`);
  } else if (cmd === 'verify' && rest[0]) {
    const o = options(rest.slice(1));
    const pinned = o['public-key'] ? readFileSync(o['public-key'], 'utf8') : undefined;
    const manifest = JSON.parse(readFileSync(rest[0], 'utf8'));
    verifyManifest(manifest, pinned);
    if (o.artifacts) verifyArtifacts(manifest, o.artifacts);
    console.log(`update-manifest: ok (${manifest.tag})`);
  } else {
    throw new Error('usage: update-manifest.mjs sign|verify ...');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`::error::update-manifest: ${e.message}`);
    process.exit(1);
  }
}
