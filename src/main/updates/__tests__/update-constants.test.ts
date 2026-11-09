import { createHash, createPublicKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { UPDATE_PUBLIC_KEY } from '../update-constants.ts';

const der = Buffer.from(UPDATE_PUBLIC_KEY, 'base64');

describe('UPDATE_PUBLIC_KEY', () => {
  it('is a valid Ed25519 SPKI key', () => {
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    expect(key.asymmetricKeyType).toBe('ed25519');
  });

  it('has the expected SHA-256 fingerprint', () => {
    expect(createHash('sha256').update(der).digest('hex')).toBe(
      '817f6cefe8091d654f0532576e10cea76b313974b9a41f82e5d7db4c04cdbd55',
    );
  });
});
