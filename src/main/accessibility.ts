import { shell, systemPreferences } from 'electron';

const SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';

/** @returns whether the app may control the cursor (macOS Accessibility permission). */
export function isGranted(): boolean {
  return systemPreferences.isTrustedAccessibilityClient(false);
}

/** Shows the system permission prompt when the permission is missing. */
export function promptOnce(): void {
  if (!isGranted()) systemPreferences.isTrustedAccessibilityClient(true);
}

/** Opens System Settings at the Accessibility pane. */
export async function openSettings(): Promise<void> {
  await shell.openExternal(SETTINGS_URL);
}
