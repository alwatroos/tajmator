import { describe, expect, it } from 'vitest';
import { compareVersions, parseVersion } from '../semver.ts';

const cmp = (a: string, b: string) =>
  compareVersions(parseVersion(a) as never, parseVersion(b) as never);

describe('semver', () => {
  it('parses with an optional v and rejects garbage', () => {
    expect(parseVersion('v1.2.0-rc.1')).toEqual({ major: 1, minor: 2, patch: 0, pre: ['rc', '1'] });
    expect(parseVersion('1.2.3')?.pre).toEqual([]);
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('latest')).toBeNull();
  });

  it('orders numerically, not lexically', () => {
    expect(cmp('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(cmp('v1.1.3', '1.1.3')).toBe(0);
  });

  it('sorts a prerelease below its release and compares identifiers', () => {
    expect(cmp('1.0.0-rc.1', '1.0.0')).toBeLessThan(0);
    expect(cmp('1.0.0-rc.10', '1.0.0-rc.2')).toBeGreaterThan(0);
    expect(cmp('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0);
    expect(cmp('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0);
  });
});
