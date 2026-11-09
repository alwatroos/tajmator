/** Where the updater is in its check, download and install cycle. */
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'available'
  | 'unverifiable'
  | 'downloading'
  | 'verified'
  | 'installing'
  | 'failed';

/** What the main process tells the UI about updates. */
export interface UpdateStatus {
  phase: UpdatePhase;
  currentVersion: string;
  checkedAt: string | null;
  release: { version: string; tag: string; htmlUrl: string; notes: string } | null;
  download: { bytes: number; totalBytes: number } | null;
  unverifiableReason: string | null;
  error: string | null;
}

/** Why the app did not replace itself and left the install to the user. */
export type InstallUpdateManualReason =
  | 'unsigned_app'
  | 'unsigned_artifact'
  | 'signature_mismatch'
  | 'not_packaged'
  | 'translocated'
  | 'not_writable';

/** What an install attempt did. Domain failures are returned, never thrown. */
export type InstallUpdateResult =
  | { outcome: 'restarting'; version: string }
  | { outcome: 'cancelled' }
  | { outcome: 'manual'; reason: InstallUpdateManualReason; filePath: string; note: string }
  | { outcome: 'failed'; error: string };

/** Shown when the running or downloaded app is not signed by the publisher. */
export const GATEKEEPER_NOTE =
  'This build is not signed by the publisher, so it cannot replace itself. Unzip the downloaded file, move "Tajmator.app" to /Applications (replace the old one), then run `xattr -dr com.apple.quarantine "/Applications/Tajmator.app"` once, or right-click the app and choose Open.';

/** Shown when the downloaded app is signed by someone else or fails verification; no bypass is offered. */
export const SIGNATURE_MISMATCH_NOTE =
  'The downloaded update did not pass the signature check (it is signed by a different publisher or was modified), so it was not installed. Do not open it. The file was revealed in Finder for inspection; delete it and check for the update again, or download the release from the official page.';

/** Shown when the app runs from a quarantined location (App Translocation). */
export const TRANSLOCATED_NOTE =
  'The app is running from a temporary, read-only location because macOS quarantined it after download, so it cannot replace itself. Quit it, move "Tajmator.app" to /Applications, open it from there, and check for the update again. The verified download was revealed in Finder.';

/** Shown when the running app's folder is not writable by the current user. */
export const NOT_WRITABLE_NOTE =
  'The app cannot replace itself because its folder is not writable by your user. Move or copy "Tajmator.app" to a writable location such as /Applications or ~/Applications, or install manually: unzip the verified download revealed in Finder and replace the old app with the new one.';

/** Shown for a development build, where there is no installed bundle to replace. */
export const NOT_PACKAGED_NOTE =
  'This is a development (unpackaged) build, so there is no installed app to replace. To install the update manually, unzip the verified download revealed in Finder and move "Tajmator.app" to /Applications.';
