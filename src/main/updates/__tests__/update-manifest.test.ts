import { describe, expect, it } from 'vitest';
import { UPDATE_PUBLIC_KEY } from '../update-constants.ts';
import { verifyUpdateManifest } from '../update-manifest.ts';
import { makeKeys, release, signedManifest } from './fixtures.ts';

const keys = makeKeys();
const art = [{ name: 'Tajmator-1.2.3-arm64-mac.zip', size: 10, sha256: 'a'.repeat(64) }];
const rel = release('v1.2.3');

describe('verifyUpdateManifest', () => {
  it('round-trips a signed manifest', () => {
    const m = signedManifest(keys, '1.2.3', art);
    expect(verifyUpdateManifest(JSON.parse(JSON.stringify(m)), keys.publicKey, rel)).toEqual({
      ok: true,
      manifest: m,
    });
  });

  it('pins the key: a manifest signed with another key is rejected', () => {
    const m = signedManifest(keys, '1.2.3', art);
    expect(verifyUpdateManifest(m, makeKeys().publicKey, rel)).toEqual({
      ok: false,
      reason: 'public key mismatch',
    });
    expect(verifyUpdateManifest(m, UPDATE_PUBLIC_KEY, rel)).toEqual({
      ok: false,
      reason: 'public key mismatch',
    });
  });

  it.each([
    [
      'sha256',
      (m: ReturnType<typeof signedManifest>) =>
        (m.artifacts[0] = { ...(art[0] as (typeof art)[number]), sha256: 'b'.repeat(64) }),
    ],
    [
      'size',
      (m: ReturnType<typeof signedManifest>) =>
        (m.artifacts[0] = { ...(art[0] as (typeof art)[number]), size: 11 }),
    ],
    ['published', (m: ReturnType<typeof signedManifest>) => (m.published = '2030-01-01')],
    ['signature', (m: ReturnType<typeof signedManifest>) => (m.signature = 'AAAA')],
  ])('rejects a tampered %s', (_name, mutate) => {
    const m = signedManifest(keys, '1.2.3', art);
    mutate(m);
    expect(verifyUpdateManifest(m, keys.publicKey, rel)).toEqual({
      ok: false,
      reason: 'signature does not verify',
    });
  });

  it('rejects a release whose tag differs from the signed one', () => {
    const m = signedManifest(keys, '1.2.3', art);
    expect(verifyUpdateManifest(m, keys.publicKey, release('v1.2.4'))).toEqual({
      ok: false,
      reason: 'version mismatch',
    });
  });

  it('rejects a manifest whose version differs from its tag, even when signed', () => {
    const m = signedManifest(keys, '1.2.3', art);
    expect(verifyUpdateManifest(m, keys.publicKey, release('v1.2.3-rc.1')).ok).toBe(false);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'x'],
    ['a missing field', { ...signedManifest(keys, '1.2.3', art), signature: undefined }],
    ['a bad artifact', { ...signedManifest(keys, '1.2.3', art), artifacts: [{ name: 'a' }] }],
    [
      'a negative size',
      { ...signedManifest(keys, '1.2.3', art), artifacts: [{ ...art[0], size: -1 }] },
    ],
  ])('treats %s as invalid', (_name, raw) => {
    expect(verifyUpdateManifest(raw, keys.publicKey, rel)).toEqual({
      ok: false,
      reason: 'invalid manifest',
    });
  });

  it('never throws on garbage key material', () => {
    const m = { ...signedManifest(keys, '1.2.3', art), publicKey: 'AAAA' };
    expect(verifyUpdateManifest(m, keys.publicKey, rel)).toEqual({
      ok: false,
      reason: 'invalid manifest',
    });
  });
});
