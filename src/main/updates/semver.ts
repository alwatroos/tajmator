/** A parsed SemVer 2.0 version (build metadata ignored). */
export interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly pre: string[];
}

const SEMVER =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Parses a version with an optional leading `v`.
 *
 * @param text - For example `v1.2.0-rc.1`.
 * @returns The parts, or null when the text is not SemVer.
 */
export function parseVersion(text: string): ParsedVersion | null {
  const m = SEMVER.exec(text.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split('.') : [],
  };
}

/** Compares two prerelease identifiers per SemVer: numbers below text, numbers numerically. */
function compareIdentifier(a: string, b: string): number {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) return Math.sign(Number(a) - Number(b));
  if (aNum !== bNum) return aNum ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compares prerelease lists: no prerelease outranks any, then identifier by identifier. */
function comparePre(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return Math.sign(b.length - a.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const c = compareIdentifier(a[i] as string, b[i] as string);
    if (c !== 0) return c;
  }
  return Math.sign(a.length - b.length);
}

/**
 * SemVer 2.0 precedence.
 *
 * @returns Negative when `a < b`, positive when `a > b`, 0 when equal.
 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  return (
    Math.sign(a.major - b.major) ||
    Math.sign(a.minor - b.minor) ||
    Math.sign(a.patch - b.patch) ||
    comparePre(a.pre, b.pre)
  );
}
