# Releases

Keep this file current whenever the release process changes. How the app picks releases up is in
[`app-updates.md`](app-updates.md).

## Branch model

One branch: `main`. Work reaches it through pull requests; CI runs on every PR and every push to
`main`.

## Releasing (one step)

Actions -> **Tag release** -> Run workflow on `main`, pick `bump` (`patch` by default, or `minor` /
`major`), or type an exact `version` (no `v`, for example `1.0.0` or `1.1.0-rc.1`). The workflow:

1. runs Biome (warnings are errors), typecheck and tests on the head of `main`,
2. bumps `package.json`, commits `chore(release): vX.Y.Z` to `main` and pushes the tag `vX.Y.Z`
   (refusing an existing tag),
3. dispatches `release.yml` on the tag (a push made with `GITHUB_TOKEN` does not trigger `push:
   tags`), which builds both architectures, signs and notarises macOS, signs `update.json` and
   creates the GitHub Release.

CLI equivalent: `gh workflow run tag-release.yml --ref main -f bump=patch`.

**First release (`1.0.0`).** `package.json` already holds `1.0.0`. Run Tag release with `version` =
`1.0.0`: because it equals the current version, the workflow skips the bump and the commit (npm
refuses an unchanged version), then tags the head of `main` as `v1.0.0` and dispatches
`release.yml`. Any other version, or a bump, commits `chore(release): vX.Y.Z` first.

## The release workflow

`release.yml` triggers on `v[0-9]+.[0-9]+.[0-9]+*` tag pushes, `workflow_dispatch` and pull requests
touching release files (`.github/workflows/release.yml`, `.github/scripts/**`,
`electron-builder.yml`, `scripts/package.mjs`, `scripts/after-pack.cjs`, `signing/**`). It
publishes only for a ref starting with `refs/tags/v`; everything else is a dry run (artifacts kept
7 days). A `-` in the tag marks a prerelease; `mode` checks that the tag equals the `package.json`
version.

**Jobs.**

- `mode`: script tests (`sh .github/scripts/update-manifest-test.sh`) and the tag check.
- `build`: matrix `arm64` / `x64` on `macos-15` (x64 is cross-built), runs `pnpm package` with
  `TAJMATOR_ARCH`, then `.github/scripts/check-native-arch.sh` (`lipo -archs`) on the app binary
  and the robotjs `.node` files. Uploads `desktop-<arch>` (`.dmg` and `.zip`).
- `sign-macos` (tag runs; environment `release`): `.github/scripts/sign-desktop.sh <arch> <dir>`
  rebuilds with `TAJMATOR_SIGN=1` (electron-builder signs and notarises), then
  `check-native-arch.sh` and `verify-macos-app.sh` run on the result, which replaces the unsigned
  artifacts.
- `manifest` (tag runs; environment `release`): signs `update.json`; `manifest-dry-run` (every
  other run) does the same with a TEST ONLY key generated in the job and publishes nothing.
- `publish`: creates the GitHub Release `Tajmator vX.Y.Z` with the `.dmg` and `.zip` files and
  `update.json`. It is the only job with `contents: write`.

**Artifacts.** arm64: `Tajmator-<v>-arm64.dmg`, `Tajmator-<v>-arm64-mac.zip`; x64:
`Tajmator-<v>.dmg`, `Tajmator-<v>-mac.zip`; plus `update.json`.

## Environment and secrets

The `release` environment (deployment rule: tags `v*`) holds the secrets. Names only:

| Secret                          | Content                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `APPLE_CERTIFICATE_P12_BASE64`  | base64 of the Developer ID Application `.p12` (becomes `CSC_LINK`) |
| `APPLE_CERTIFICATE_PASSWORD`    | the `.p12` password (`CSC_KEY_PASSWORD`)                           |
| `APPLE_API_KEY_P8_BASE64`       | base64 (or raw PEM) of the App Store Connect `AuthKey_<id>.p8`     |
| `APPLE_API_KEY_ID`              | the key id                                                         |
| `APPLE_API_ISSUER_ID`           | the issuer id                                                      |
| `UPDATE_SIGNING_KEY` (optional) | Ed25519 private key that signs `update.json`                       |

`UPDATE_SIGNING_KEY` must match the public key pinned in the app
(`src/main/updates/update-constants.ts`); without it the release carries no manifest and the in-app
updater finds nothing to install.

**Unsigned fallback.** The five `APPLE_*` secrets are required, or `sign-macos` fails and nothing
publishes, unless the repository variable `ALLOW_UNSIGNED_FALLBACK` (optional) is `true`: then that
architecture ships unsigned (ad-hoc) with a warning, and the release notes tell users how to open
`/Applications/Tajmator.app` past Gatekeeper.

## Local packaging

`pnpm package` produces an unsigned `.dmg` and `.zip` in `release/` (`TAJMATOR_ARCH=x64` for Intel).
`TAJMATOR_SIGN=1` signs and notarises and needs `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`,
`APPLE_API_KEY_ID` and `APPLE_API_ISSUER`.

## Dry run and removal

`gh workflow run release.yml --ref <branch>` builds unsigned and uploads artifacts only. A bad
release goes with `gh release delete <tag> --cleanup-tag` (the `chore(release)` commit stays on
`main`).
