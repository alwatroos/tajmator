/**
 * Produces the macOS .dmg and .zip: build, electron-builder, verify.
 * Unsigned by default (`-c.mac.identity=null`); TAJMATOR_SIGN=1 signs and notarises (release CI only).
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureElectron } from './ensure-electron.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const arch = process.env.TAJMATOR_ARCH || 'arm64';

/**
 * Lists every `.node` binary below a directory.
 *
 * @param {string} dir - Directory to walk.
 * @returns {string[]} Binary paths.
 */
function findNatives(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return findNatives(path);
    return name.endsWith('.node') ? [path] : [];
  });
}

/**
 * Fails unless the packaged app holds at least one unpacked robotjs `.node` binary.
 *
 * @returns {string} The packaged `.app` path.
 */
function verifyPackagedApp() {
  const outDir = join(ROOT, 'release', arch === 'arm64' ? 'mac-arm64' : 'mac');
  const app = join(outDir, 'Tajmator.app');
  const robotjs = join(app, 'Contents/Resources/app.asar.unpacked/node_modules/@jitsi/robotjs');
  const natives = findNatives(robotjs);
  if (natives.length === 0) throw new Error(`No .node binary found in ${robotjs}`);
  console.log(`[package] ${natives.length} robotjs native binary(ies) in ${app}`);
  return app;
}

const SIGN_VARIABLES = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
];

/**
 * Builds the electron-builder arguments and environment for an unsigned or a signed build.
 *
 * @param {string} targetArch - `arm64` or `x64`.
 * @param {boolean} signing - True for a signed and notarised build.
 * @returns {{ args: string[], env: NodeJS.ProcessEnv }} Arguments and environment.
 */
function builderInvocation(targetArch, signing) {
  const args = ['--mac', `--${targetArch}`, '--publish', 'never'];
  if (!signing) {
    return {
      args: [...args, '-c.mac.identity=null'],
      env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
    };
  }
  const missing = SIGN_VARIABLES.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Signing needs these variables: ${missing.join(', ')}`);
  return { args, env: process.env };
}

// Resolved first so a signed build with missing variables fails before the long build.
const { args, env } = builderInvocation(arch, process.env.TAJMATOR_SIGN === '1');
execFileSync('pnpm', ['build'], { cwd: ROOT, stdio: 'inherit' });
ensureElectron();
execFileSync(join(ROOT, 'node_modules/.bin/electron-builder'), args, {
  cwd: ROOT,
  stdio: 'inherit',
  env,
});
verifyPackagedApp();
