import { atom } from 'jotai';
import { DEFAULT_SETTINGS } from '../../../shared/settings.constants.js';
import { getBridge } from './bridge.js';

/** Client-side cache of the settings owned by the main process. */
export const settingsAtom = atom(DEFAULT_SETTINGS);

/** True while the initial settings fetch is in flight. */
export const settingsLoadingAtom = atom(true);

/**
 * Write-only atom: optimistically patch settings, then reconcile with main.
 * @type {import('jotai').WritableAtom<null, [Partial<AppSettings>], void>}
 */
export const updateSettingsAtom = atom(null, (get, set, patch) => {
  set(settingsAtom, { ...get(settingsAtom), ...patch });
  getBridge().updateSettings(patch).then((saved) => set(settingsAtom, saved));
});
