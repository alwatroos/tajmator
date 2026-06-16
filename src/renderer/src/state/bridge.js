/**
 * @typedef {Object} TajmatorApi
 * @property {() => Promise<AppSettings>} getSettings - Fetch current settings.
 * @property {(patch: Partial<AppSettings>) => Promise<AppSettings>} updateSettings - Persist a patch.
 * @property {(cb: (settings: AppSettings) => void) => () => void} onSettingsChanged - Subscribe to changes.
 * @property {(cb: (status: AppStatus) => void) => () => void} onStatus - Subscribe to status updates.
 */

/**
 * Access the preload-exposed API bridge.
 * @returns {TajmatorApi} The bridge object injected by the preload script.
 */
export const getBridge = () => /** @type {TajmatorApi} */ (window.tajmator);
