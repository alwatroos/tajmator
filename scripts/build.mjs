/**
 * Bundles the Electron main (ESM), the preload (CJS, sandboxed preloads cannot be ESM) and the
 * renderer (browser) with esbuild, and copies the renderer's static files.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const external = ['electron', '@jitsi/robotjs'];

const node = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  external,
  logLevel: 'info',
};

await build({
  ...node,
  entryPoints: [join(ROOT, 'src/main/main.ts')],
  outfile: join(ROOT, 'dist/main/main.js'),
  format: 'esm',
  banner: {
    js: "import { createRequire as __tjCreateRequire } from 'node:module'; const require = __tjCreateRequire(import.meta.url);",
  },
});

await build({
  ...node,
  entryPoints: [join(ROOT, 'src/preload/preload.ts')],
  outfile: join(ROOT, 'dist/preload/preload.cjs'),
  format: 'cjs',
});

const rendererEntry = join(ROOT, 'src/renderer/main.tsx');
if (existsSync(rendererEntry)) {
  await build({
    entryPoints: [rendererEntry],
    outfile: join(ROOT, 'dist/renderer/main.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'chrome140',
    jsx: 'automatic',
    external,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'info',
  });
  mkdirSync(join(ROOT, 'dist/renderer'), { recursive: true });
  for (const file of ['index.html', 'styles.css']) {
    const from = join(ROOT, 'src/renderer', file);
    if (existsSync(from)) copyFileSync(from, join(ROOT, 'dist/renderer', file));
  }
} else {
  console.warn('src/renderer/main.tsx not found: skipping the renderer build');
}
