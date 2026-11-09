/**
 * Makes sure the Electron binary was downloaded (electron's package has no postinstall hook).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Runs electron's own `install.js` when `path.txt` is missing.
 */
export function ensureElectron() {
  const dir = join(ROOT, 'node_modules/electron');
  if (existsSync(join(dir, 'path.txt'))) return;
  execFileSync('node', [join(dir, 'install.js')], { stdio: 'inherit' });
}
