import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc.constants.js';

/**
 * Subscribe to a main-to-renderer channel, exposing only the payload.
 * Never forwards the Electron event object, avoiding sender/IPC leaks.
 * @param {string} channel - IPC channel name.
 * @param {(payload: unknown) => void} callback - Receives the payload only.
 * @returns {() => void} Unsubscribe function.
 */
const subscribe = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

/** Minimal, whitelisted API exposed to the renderer. */
const api = {
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  onSettingsChanged: (callback) => subscribe(IPC.settingsChanged, callback),
  onStatus: (callback) => subscribe(IPC.status, callback),
};

contextBridge.exposeInMainWorld('tajmator', api);
