import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc.constants.js';
import { getSettings, saveSettings } from '../settings/settings.store.js';

/**
 * Persist an untrusted settings patch and notify the rest of the app.
 * @param {Partial<AppSettings>} patch - Settings patch from the renderer.
 * @param {(settings: AppSettings) => void} onChange - Change callback.
 * @returns {AppSettings} The normalized, stored settings.
 */
const applyUpdate = (patch, onChange) => {
  const next = saveSettings(patch);
  onChange(next);
  return next;
};

/**
 * Register IPC handlers for reading and updating settings.
 * @param {(settings: AppSettings) => void} onChange - Called after each update.
 * @returns {void}
 */
export const registerIpcHandlers = (onChange) => {
  ipcMain.handle(IPC.getSettings, () => getSettings());
  ipcMain.handle(IPC.updateSettings, (_event, patch) => applyUpdate(patch, onChange));
};
