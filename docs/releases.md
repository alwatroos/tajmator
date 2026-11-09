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
2. computes the version from the highest stable `v*` tag (or takes the exact `version`) and pushes only
   the tag `vX.Y.Z`, refusing an existing tag. It never commits to `main`, which the `main` ruleset
   protects,
3. dispatches `release.yml` on the tag (a push made with `GITHUB_TOKEN` does not trigger `push:
   tags`), which builds both architectures, signs and notarises macOS, signs `update.json` and
   creates the GitHub Release.

CLI equivalent: `gh workflow run tag-release.yml --ref main -f bump=patch`.

**Version source.** `main` holds the placeholder version `0.0.0` in `package.json`. It is never
released and is lower than any release, so the updater never treats a dev build as newer.
`release.yml` stamps the tag version into `package.json` in the build workspace
(`.github/scripts/stamp-version.sh`), so the app, the artifact names and `update.json` carry the real
version. A local `pnpm package` yields `Tajmator-0.0.0-*`. A bump starts from the highest stable `v*`
tag; with no tags, a patch gives `0.0.1`. Bumps ignore prerelease tags. The version logic is in
`.github/scripts/next-version.sh`, tested by `next-version-test.sh` and `stamp-version-test.sh`.

## The release workflow

`release.yml` triggers on `v[0-9]+.[0-9]+.[0-9]+*` tag pushes, `workflow_dispatch` and pull requests
touching release files (`.github/workflows/release.yml`, `.github/scripts/**`,
`electron-builder.yml`, `scripts/package.mjs`, `scripts/after-pack.cjs`, `signing/**`). It
publishes only for a ref starting with `refs/tags/v`; everything else is a dry run (artifacts kept
7 days). A `-` in the tag marks a prerelease; on a publishing run `mode` outputs the tag's version and
fails unless `package.json` holds `0.0.0` (or already equals the tag version, so a re-dispatch on an
older tag still works).

**Jobs.**

- `mode`: script tests (`update-manifest-test.sh`, `next-version-test.sh`,
  `stamp-version-test.sh` in `.github/scripts/`) and the version check above.
- `build`: matrix `arm64` / `x64` on `macos-15` (x64 is cross-built), stamps the version, runs `pnpm package` with
  `TAJMATOR_ARCH`, then `.github/scripts/check-native-arch.sh` (`lipo -archs`) on the app binary
  and the robotjs `.node` files. Uploads `desktop-<arch>` (`.dmg` and `.zip`).
- `sign-macos` (tag runs; environment `release`): stamps the version, then `.github/scripts/sign-desktop.sh <arch> <dir>`
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

`UPDATE_SIGNING_KEY` is an Ed25519 private key in PEM PKCS8 format (`update-manifest.mjs` also
accepts the base64 of the PEM or of the PKCS8 DER). It lives only in the `release` environment and
must match `UPDATE_PUBLIC_KEY` in `src/main/updates/update-constants.ts`. It is Tajmator's own key,
not agentic-workflow's; only the Apple signing identity is shared. The SHA-256 fingerprint of the
public key (SPKI DER) is `817f6cefe8091d654f0532576e10cea76b313974b9a41f82e5d7db4c04cdbd55`.
Without the secret the release carries no manifest and the in-app updater finds nothing to
install.

### Rotating the update signing key

1. Generate a key with `openssl genpkey -algorithm ED25519 -out update-signing.pem`. Derive the
   public key with `openssl pkey -in update-signing.pem -pubout -outform DER | base64` and its
   fingerprint with `openssl pkey -in update-signing.pem -pubout -outform DER | shasum -a 256`.
2. If installed apps exist, first ship one release that pins the new `UPDATE_PUBLIC_KEY` while it
   is still signed with the old secret, so installed apps can verify it and pick up the new pin.
3. Set the secret in the `release` environment to the new PEM:
   `gh secret set UPDATE_SIGNING_KEY --env release < update-signing.pem`.
4. Update `UPDATE_PUBLIC_KEY`, the fingerprint test and both docs, if step 2 has not done so.
5. Keep the private key out of the repository and delete the local copy after backing it up.

Apps built with an older key cannot verify manifests signed with a newer one. The current key
replaced one that never shipped.

**Unsigned fallback.** The five `APPLE_*` secrets are required, or `sign-macos` fails and nothing
publishes, unless the repository variable `ALLOW_UNSIGNED_FALLBACK` (optional) is `true`: then that
architecture ships unsigned (ad-hoc) with a warning, and the release notes tell users how to open
`/Applications/Tajmator.app` past Gatekeeper.

## Entitlements

`signing/entitlements.mac.plist` grants `allow-jit` and `allow-unsigned-executable-memory`
(Electron/V8) and `disable-library-validation`. The last one stays until a signed build proves it
is unnecessary. The app loads the native `@jitsi/robotjs` `.node` from
`Contents/Resources/app.asar.unpacked/node_modules/@jitsi/robotjs`. That package ships prebuilt
binaries from another team, and no release step checks that every packaged `.node` carries
Tajmator's Team ID (`check-native-arch.sh` checks the architecture only, and `verify-macos-app.sh`
checks the bundle signature only). With library validation on, a `.node` signed by another team, or
left unsigned, fails to load, and the app shows "Cursor control unavailable".

**Test that settles it** (signed and notarised build, both architectures):

1. `TAJMATOR_SIGN=1 pnpm package` (and `TAJMATOR_ARCH=x64`). In `release/mac*/Tajmator.app`, run
   `codesign -dv --verbose=4 <file> 2>&1 | grep TeamIdentifier` for `Contents/MacOS/Tajmator` and every
   file from `find Contents/Resources/app.asar.unpacked -name '*.node' -o -name '*.dylib'`. All must
   print the same TeamIdentifier, and none may print `not set` or `adhoc`.
2. Remove the `disable-library-validation` key, package and notarise again, and confirm with
   `codesign -d --entitlements - Tajmator.app` that it is gone.
3. Install from the `.dmg` on a clean Mac of each architecture and launch. There must be no "Cursor
   control unavailable" dialog, the cursor must move once Accessibility is granted, and
   `log show --last 5m --predicate 'process == "Tajmator"' | grep -i "library validation\|different Team IDs"`
   must be empty.

Only when 1 to 3 pass on both architectures, remove the key in a pull request that also adds the
TeamIdentifier check from step 1 to `sign-desktop.sh`.

## Local packaging

`pnpm package` produces an unsigned `.dmg` and `.zip` in `release/` (`TAJMATOR_ARCH=x64` for Intel).
`TAJMATOR_SIGN=1` signs and notarises and needs `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`,
`APPLE_API_KEY_ID` and `APPLE_API_ISSUER`.

## Dry run and removal

`gh workflow run release.yml --ref <branch>` builds unsigned and uploads artifacts only. A bad
release goes with `gh release delete <tag> --cleanup-tag`.
