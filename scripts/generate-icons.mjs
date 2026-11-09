/**
 * Generates the app and tray icon rasters from the SVG masters in `assets/`:
 * `assets/icon/icon.icns` and `assets/icon/icon.png` (824 px body on a transparent 1024 canvas
 * with a drop shadow), and `assets/tray/tray-<status>.png` (16 px) plus `@2x` (32 px) with the
 * `{{COLOR}}` placeholder of `assets/tray/tray.svg` replaced per status. Needs macOS (`sips`,
 * `iconutil`) and Google Chrome (`CHROME_PATH` overrides the default).
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MASTER = join(ROOT, 'assets', 'icon', 'icon.svg');
const ICNS = join(ROOT, 'assets', 'icon', 'icon.icns');
const PNG = join(ROOT, 'assets', 'icon', 'icon.png');
const TRAY_SVG = join(ROOT, 'assets', 'tray', 'tray.svg');
const TRAY_DIR = join(ROOT, 'assets', 'tray');
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** Copied from `STATUS_COLORS` in `src/shared/types.ts` (this file is plain JS). */
const STATUS_COLORS = { active: '#22c55e', idle: '#f59e0b', sleep: '#9ca3af' };
const ICONSET = [
  ['16x16', 16],
  ['16x16@2x', 32],
  ['32x32', 32],
  ['32x32@2x', 64],
  ['128x128', 128],
  ['128x128@2x', 256],
  ['256x256', 256],
  ['256x256@2x', 512],
  ['512x512', 512],
  ['512x512@2x', 1024],
];

/**
 * Aborts with a clear message.
 *
 * @param {string} message - Reason.
 * @returns {never} Never returns.
 */
function fail(message) {
  console.error(`[icons] ${message}`);
  process.exit(1);
}

/**
 * Writes an HTML wrapper that shows an image.
 *
 * @param {string} path - Output HTML path.
 * @param {string} image - Image path.
 * @param {string} style - CSS for the `<img>`.
 */
function writeWrapper(path, image, style) {
  const css = 'html,body{margin:0;background:transparent}';
  writeFileSync(
    path,
    `<!doctype html><style>${css}img{${style}}</style><img src="${pathToFileURL(image).href}">`,
  );
}

/**
 * Throws unless a PNG is 1024x1024 with an alpha channel.
 *
 * @param {string} png - PNG path.
 */
function verifyRender(png) {
  const info = execFileSync(
    '/usr/bin/sips',
    ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', png],
    { encoding: 'utf8' },
  );
  const get = (key) => new RegExp(`${key}: (\\S+)`).exec(info)?.[1];
  if (get('pixelWidth') !== '1024' || get('pixelHeight') !== '1024' || get('hasAlpha') !== 'yes') {
    throw new Error(`render check failed for ${png}: ${info.trim().replace(/\s+/g, ' ')}`);
  }
}

/**
 * Renders an HTML wrapper to a 1024 px transparent PNG with headless Chrome and verifies it.
 *
 * @param {string} html - Wrapper path.
 * @param {string} out - PNG output path.
 */
function render(html, out) {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1024,1024',
    '--default-background-color=00000000',
    `--screenshot=${out}`,
    pathToFileURL(html).href,
  ];
  execFileSync(CHROME, args, { stdio: 'ignore' });
  verifyRender(out);
}

/**
 * Resizes a PNG with sips.
 *
 * @param {string} src - Source PNG.
 * @param {number} size - Target side in pixels.
 * @param {string} out - Output PNG path.
 */
function resize(src, size, out) {
  execFileSync('/usr/bin/sips', ['-z', String(size), String(size), src, '--out', out], {
    stdio: 'ignore',
  });
}

/**
 * Renders the padded app icon, then writes `icon.png` and `icon.icns`.
 *
 * @param {string} dir - Temp dir.
 */
function writeAppIcon(dir) {
  const shadow = 'filter:drop-shadow(0 10px 10px rgba(0,0,0,.3))';
  const css = `position:absolute;left:100px;top:100px;width:824px;height:824px;${shadow}`;
  const mac = join(dir, 'mac-1024.png');
  writeWrapper(join(dir, 'mac.html'), MASTER, css);
  render(join(dir, 'mac.html'), mac);
  const set = join(dir, 'icon.iconset');
  mkdirSync(set);
  for (const [name, size] of ICONSET) resize(mac, size, join(set, `icon_${name}.png`));
  mkdirSync(dirname(ICNS), { recursive: true });
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', set, '-o', ICNS]);
  copyFileSync(mac, PNG);
  console.log(`[icons] wrote ${ICNS} and ${PNG}`);
}

/**
 * Writes the tray PNGs for every status at 16 and 32 px.
 *
 * @param {string} dir - Temp dir.
 */
function writeTrayIcons(dir) {
  const template = readFileSync(TRAY_SVG, 'utf8');
  const css = 'position:absolute;left:0;top:0;width:1024px;height:1024px';
  mkdirSync(TRAY_DIR, { recursive: true });
  for (const [status, color] of Object.entries(STATUS_COLORS)) {
    const svg = join(dir, `tray-${status}.svg`);
    const big = join(dir, `tray-${status}-1024.png`);
    writeFileSync(svg, template.replaceAll('{{COLOR}}', color));
    writeWrapper(join(dir, `tray-${status}.html`), svg, css);
    render(join(dir, `tray-${status}.html`), big);
    resize(big, 16, join(TRAY_DIR, `tray-${status}.png`));
    resize(big, 32, join(TRAY_DIR, `tray-${status}@2x.png`));
  }
  console.log(`[icons] wrote tray icons in ${TRAY_DIR}`);
}

/** Runs the generator. */
function main() {
  if (process.platform !== 'darwin') fail('macOS is required (sips, iconutil)');
  if (!existsSync(CHROME)) fail(`Google Chrome not found at ${CHROME} (set CHROME_PATH)`);
  const dir = mkdtempSync(join(tmpdir(), 'tajmator-icons-'));
  try {
    writeAppIcon(dir);
    writeTrayIcons(dir);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();
