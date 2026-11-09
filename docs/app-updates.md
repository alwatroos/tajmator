# App updates

Keep this file current whenever the updater in `src/main/updates/` changes. The release side
(how `update.json` and the zips are built and published) is in [`releases.md`](releases.md).

`UpdateService` (`src/main/updates/update-service.ts`) is built in `main.ts`, started after
`engine.start()` and stopped in `before-quit`. It checks for a newer signed release, downloads
it on request and verifies it. Installing is a separate step (`install-update.ts`) that always
asks first. The renderer can only call the bridge methods below, and none of them takes a URL
or a path.

- **Source.** `GET https://api.github.com/repos/alwatroos/tajmator/releases?per_page=30`,
  anonymously (the repository is public; there is no token and no feed override). Drafts,
  prereleases and non-semver tags are ignored; the highest version wins. If the repository
  were private, a check would end in `failed`.
- **Schedule.** The first check runs 10 s after start, then one every 6 h after the previous
  one finished, plus "Check for Updates" in the tray and the settings window. A failure
  surfaces as `phase: failed` and never blocks startup.
- **Phases.** `idle` -> `checking` -> `up_to_date` | `available` | `unverifiable` | `failed`.
  `download` only starts from `available` and goes `downloading` -> `verified` (or `failed`).
  `installing` is set while the installer runs.
- **Verification** (`update-manifest.ts`, mirrors `.github/scripts/update-manifest.mjs`). The
  pinned `UPDATE_PUBLIC_KEY` must equal the manifest's key, the Ed25519 signature must verify
  and `version`/`tag` must equal the release tag. Anything else, or a release without the zip
  for this arch, is `unverifiable` and can never be downloaded. Manifests are checked by
  hand-written type guards (no schema library).
- **Artifacts.** The zip only: arm64 `Tajmator-<v>-arm64-mac.zip`, x64 `Tajmator-<v>-mac.zip`,
  matched by exact name against the manifest (size and sha256) and the release asset, and only
  from `https://github.com` or this repository's asset endpoint on `api.github.com`. It is
  streamed to `<userData>/updates/<tag>/<name>.part`, size and sha256 are checked and the file
  is renamed; any failure deletes the partial file. Other versions' folders are pruned.
- **A failed re-check keeps a verified download** (phase `verified`, only `checkedAt`
  refreshes); any other failure sets `failed` with `download: null`.
- **Install.** The tray item "Install Update <v> and Restart…" and the settings button call
  `installUpdate`, which first shows a native confirmation (Cancel -> `cancelled`). Then
  `install-update.ts` re-copies the zip into a private stage next to the app and re-hashes it,
  extracts it with `ditto`, requires the same Developer ID team and identifier on both apps,
  a passing `codesign`/`spctl` assessment and the expected `CFBundleShortVersionString`, swaps
  the bundle with two same-volume renames (rolling back on failure) and relaunches. Leftovers
  of an earlier swap are cleaned at start, never the running bundle.
- **Manual outcomes.** When the app cannot replace itself, nothing is replaced, the zip is
  revealed in Finder and a dialog shows the note. Reasons: `unsigned_app`, `unsigned_artifact`
  (a build without a Developer ID signature, such as a local `pnpm package`),
  `signature_mismatch` (no bypass is offered), `translocated`, `not_writable`, `not_packaged`.
- **Bridge.** `getUpdateStatus`, `checkForUpdates`, `downloadUpdate`, `installUpdate` and the
  `onUpdateStatusChanged` event (`IPC_CHANNELS` in `src/shared/ipc.ts`, DTOs in
  `src/shared/updates.ts`). The settings window shows release notes as plain text and links
  only `https:` URLs.

## Update signing key

The pinned `UPDATE_PUBLIC_KEY` is Tajmator's own Ed25519 key. It is not shared with
agentic-workflow; only the Apple signing identity is shared.

- **Fingerprint** (SHA-256 of the SPKI DER): `817f6cefe8091d654f0532576e10cea76b313974b9a41f82e5d7db4c04cdbd55`.
- **Private key.** The secret `UPDATE_SIGNING_KEY` in the GitHub `release` environment, in PEM
  PKCS8 format.
- **Older key.** Apps built with the earlier key cannot verify manifests signed with this one.
  No such app was ever released.

Rotation steps are in [`releases.md`](releases.md#rotating-the-update-signing-key).
