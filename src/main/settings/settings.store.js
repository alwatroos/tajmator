import Store from 'electron-store';
import { DEFAULT_SETTINGS } from '../../shared/settings.constants.js';
import { normalizeSettings } from './settings.schema.js';

/** Persistent settings store backed by a local JSON file. */
const store = new Store({ name: 'settings', defaults: { settings: DEFAULT_SETTINGS } });

/**
 * Read the persisted settings, normalized to a valid shape.
 * @returns {AppSettings} The current settings.
 */
export const getSettings = () => normalizeSettings(store.get('settings'));

/**
 * Merge a patch into the current settings and persist the result.
 * @param {Partial<AppSettings>} patch - Settings fields to update.
 * @returns {AppSettings} The stored, normalized settings.
 */
export const saveSettings = (patch) => {
  const next = normalizeSettings({ ...getSettings(), ...patch });
  store.set('settings', next);
  return next;
};
