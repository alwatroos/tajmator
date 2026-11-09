import { describe, expect, it } from 'vitest';
import {
  CODESIGN,
  canSelfReplace,
  DITTO,
  PLUTIL,
  parseCodesignInfo,
  type SignatureInfo,
  SPCTL,
  verifyNewApp,
} from '../code-signature.ts';

const SIGNED = `Executable=/A/Contents/MacOS/Tajmator
Identifier=com.alwatroos.tajmator
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=1 flags=0x10000(runtime) hashes=1 location=embedded
Authority=Developer ID Application: Someone (ABCDE12345)
Authority=Developer ID Certification Authority
TeamIdentifier=ABCDE12345`;
const ADHOC = `Identifier=com.alwatroos.tajmator
Signature=adhoc
TeamIdentifier=not set`;

describe('parseCodesignInfo', () => {
  it('parses a Developer ID signature', () => {
    expect(parseCodesignInfo(SIGNED)).toEqual({
      identifier: 'com.alwatroos.tajmator',
      teamIdentifier: 'ABCDE12345',
      developerId: true,
    });
  });

  it('parses an ad-hoc signature as not Developer ID', () => {
    expect(parseCodesignInfo(ADHOC)).toEqual({
      identifier: 'com.alwatroos.tajmator',
      teamIdentifier: null,
      developerId: false,
    });
  });
});

describe('canSelfReplace', () => {
  const sig = (over: Partial<SignatureInfo> = {}): SignatureInfo => ({
    identifier: 'id',
    teamIdentifier: 'T',
    developerId: true,
    ...over,
  });
  it('needs matching Developer ID team and identifier on both', () => {
    expect(canSelfReplace(sig(), sig())).toBe(true);
    expect(canSelfReplace(sig({ developerId: false }), sig())).toBe(false);
    expect(canSelfReplace(sig(), sig({ developerId: false }))).toBe(false);
    expect(canSelfReplace(sig(), sig({ teamIdentifier: 'U' }))).toBe(false);
    expect(canSelfReplace(sig(), sig({ identifier: 'other' }))).toBe(false);
    expect(canSelfReplace(sig({ teamIdentifier: null }), sig({ teamIdentifier: null }))).toBe(
      false,
    );
  });
});

describe('verifyNewApp', () => {
  const exec = (codes: number[], assess = 'source=Notarized Developer ID') => {
    const calls: string[] = [];
    return {
      calls,
      fn: async (file: string) => {
        calls.push(file);
        return { code: codes.shift() ?? 0, stdout: '', stderr: file === SPCTL ? assess : '' };
      },
    };
  };
  it('requires both commands and the notarized source', async () => {
    expect(await verifyNewApp(exec([0, 0]).fn, '/a')).toBe(true);
    const failing = exec([1]);
    expect(await verifyNewApp(failing.fn, '/a')).toBe(false);
    expect(failing.calls).toEqual([CODESIGN]);
    expect(await verifyNewApp(exec([0, 1]).fn, '/a')).toBe(false);
    expect(await verifyNewApp(exec([0, 0], 'source=Unnotarized Developer ID').fn, '/a')).toBe(
      false,
    );
  });
});

describe('system tool paths', () => {
  it('are absolute', () => {
    for (const tool of [CODESIGN, SPCTL, DITTO, PLUTIL]) expect(tool.startsWith('/')).toBe(true);
  });

  it('verifyNewApp runs codesign and spctl by absolute path', async () => {
    const calls: string[] = [];
    await verifyNewApp(async (file) => {
      calls.push(file);
      return { code: 0, stdout: '', stderr: 'source=Notarized Developer ID' };
    }, '/a');
    expect(calls).toEqual([CODESIGN, SPCTL]);
  });
});
