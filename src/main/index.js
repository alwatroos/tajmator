import { app, BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc.constants.js';
import { createMainWindow, getMainWindow, allowQuit } from './window/window.manager.js';
import { createTray, refreshTray } from './tray/tray.manager.js';
import { registerIpcHandlers } from './ipc/ipc.handlers.js';
import { getSettings, saveSettings } from './settings/settings.store.js';
import { startScheduler, restartScheduler, onStatus } from './scheduler/scheduler.runner.js';

/**
 * Send a payload to the renderer if a window is available.
 * @param {string} channel - IPC channel to emit on.
 * @param {unknown} payload - Data to deliver.
 * @returns {void}
 */
const broadcast = (channel, payload) => {
  getMainWindow()?.webContents.send(channel, payload);
};

/**
 * React to a settings change from any source (UI or tray).
 * @param {AppSettings} settings - The new settings.
 * @returns {void}
 */
const handleSettingsChange = (settings) => {
  restartScheduler();
  refreshTray(trayActions);
  broadcast(IPC.settingsChanged, settings);
};

/**
 * Flip the enabled flag, persist it and propagate the change.
 * @returns {void}
 */
const toggleEnabled = () => handleSettingsChange(saveSettings({ enabled: !getSettings().enabled }));

/** Tray action callbacks bound to application behavior. @type {import('./tray/tray.manager.js').TrayActions} */
const trayActions = {
  onToggle: toggleEnabled,
  onShow: createMainWindow,
  onQuit: () => { allowQuit(); app.quit(); },
};

/**
 * Initialize windows, tray, IPC and the scheduler once Electron is ready.
 * @returns {void}
 */
const bootstrap = () => {
  registerIpcHandlers(handleSettingsChange);
  onStatus((status) => broadcast(IPC.status, status));
  createMainWindow();
  createTray(trayActions);
  startScheduler();
};

/**
 * Wire Electron lifecycle events and enforce a single instance.
 * @returns {void}
 */
const main = () => {
  if (!app.requestSingleInstanceLock()) return app.quit();
  app.on('second-instance', createMainWindow);
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createMainWindow(); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', allowQuit);
  app.whenReady().then(bootstrap);
};

main();
