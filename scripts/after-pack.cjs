/**
 * electron-builder afterPack hook: ad-hoc re-signs the bundle of an unsigned build (an unsigned arm64 app whose
 * Info.plist was edited can show as damaged).
 * A signed build (TAJMATOR_SIGN=1) skips the ad-hoc signature: electron-builder signs after this hook.
 */
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

/**
 * @param {{ appOutDir: string, packager: { appInfo: { productFilename: string } } }} context
 */
exports.default = async function afterPack(context) {
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (process.env.TAJMATOR_SIGN !== '1') {
    execFileSync('codesign', ['--force', '--deep', '-s', '-', app], { stdio: 'inherit' });
  }
};
