import { execFile } from 'node:child_process';

/** Absolute tool paths: a login-shell `PATH` can put a planted binary first, so never resolve by name. */
export const CODESIGN = '/usr/bin/codesign';
/** Absolute path of `spctl`. */
export const SPCTL = '/usr/sbin/spctl';
/** Absolute path of `ditto`. */
export const DITTO = '/usr/bin/ditto';
/** Absolute path of `plutil`. */
export const PLUTIL = '/usr/bin/plutil';

/** Result of one external command. */
export interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs a program with an argument vector (no shell). */
export type ExecFn = (file: string, args: readonly string[]) => Promise<ExecResult>;

/** What `codesign -dv` says about a bundle. */
export interface SignatureInfo {
  readonly identifier: string | null;
  readonly teamIdentifier: string | null;
  readonly developerId: boolean;
}

/** Real {@link ExecFn} over `execFile`; never rejects for a non-zero exit. */
export const execFileResult: ExecFn = (file, args) =>
  new Promise((resolve) => {
    execFile(
      file,
      [...args],
      { maxBuffer: 4_000_000, timeout: 120_000 },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        resolve({ code, stdout, stderr: error && !stderr ? error.message : stderr });
      },
    );
  });

/**
 * Parses `codesign -dv --verbose=2` output.
 *
 * @param text - stderr and stdout of the command.
 * @returns The identifier, team and whether a Developer ID Application authority is present.
 */
export function parseCodesignInfo(text: string): SignatureInfo {
  const value = (key: string) => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? null;
  const team = value('TeamIdentifier');
  return {
    identifier: value('Identifier'),
    teamIdentifier: team === 'not set' ? null : team,
    developerId: /^Authority=Developer ID Application/m.test(text),
  };
}

/** Reads a bundle's signature; an unsigned bundle (or a failing command) yields an unsigned info. */
export async function readSignature(exec: ExecFn, app: string): Promise<SignatureInfo> {
  const result = await exec(CODESIGN, ['-dv', '--verbose=2', app]);
  return parseCodesignInfo(`${result.stderr}\n${result.stdout}`);
}

/** True when the bundle passes `codesign --verify` and Gatekeeper reports Notarized Developer ID. */
export async function verifyNewApp(exec: ExecFn, app: string): Promise<boolean> {
  const verify = await exec(CODESIGN, ['--verify', '--deep', '--strict', '--verbose=2', app]);
  if (verify.code !== 0) return false;
  const assess = await exec(SPCTL, ['--assess', '--type', 'execute', '--verbose=2', app]);
  return (
    assess.code === 0 &&
    `${assess.stderr}${assess.stdout}`.includes('source=Notarized Developer ID')
  );
}

/** True only when both are Developer ID signed by the same team with the same identifier. */
export function canSelfReplace(current: SignatureInfo, next: SignatureInfo): boolean {
  return (
    current.developerId &&
    next.developerId &&
    current.teamIdentifier !== null &&
    current.teamIdentifier === next.teamIdentifier &&
    current.identifier !== null &&
    current.identifier === next.identifier
  );
}

/**
 * Reads `CFBundleShortVersionString` from an app's Info.plist.
 *
 * @param exec - Command runner.
 * @param app - The `.app` bundle.
 * @returns The version, or null when it cannot be read.
 */
export async function readBundleVersion(exec: ExecFn, app: string): Promise<string | null> {
  const plist = `${app}/Contents/Info.plist`;
  const result = await exec(PLUTIL, [
    '-extract',
    'CFBundleShortVersionString',
    'raw',
    '-o',
    '-',
    plist,
  ]);
  const version = result.stdout.trim();
  return result.code === 0 && version ? version : null;
}
