import { useAtomValue } from 'jotai';
import { appStateAtom } from '../atoms.ts';

/** Warns when macOS Accessibility permission is missing. */
export function PermissionBanner() {
  const state = useAtomValue(appStateAtom);
  if (!state || state.accessibilityGranted) return null;
  return (
    <section className="banner" role="alert">
      <p>Accessibility permission is missing, so Tajmator cannot move the cursor.</p>
      <button type="button" onClick={() => void window.tajmator.openAccessibilitySettings()}>
        Open Accessibility settings
      </button>
    </section>
  );
}
