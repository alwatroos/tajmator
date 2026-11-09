/**
 * Dev launcher: makes sure Electron is installed, builds everything, then starts Electron
 * unpackaged.
 */
import { execFileSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureElectron } from './ensure-electron.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const electron = join(ROOT, 'node_modules/.bin/electron');

ensureElectron();
execFileSync('node', [join(ROOT, 'scripts/build.mjs')], { stdio: 'inherit' });
const child = spawn(electron, [ROOT], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
