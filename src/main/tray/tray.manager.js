import { Tray, Menu, nativeImage } from 'electron';
import trayIconPath from '../../../resources/tray.png?asset';
import { getSettings } from '../settings/settings.store.js';

/**
 * @typedef {Object} TrayActions
 * @property {() => void} onToggle - Toggle the enabled state.
 * @property {() => void} onShow - Reveal the main window.
 * @property {() => void} onQuit - Quit the application.
 */

/** @type {Tray | null} */
let tray = null;

/**
 * Build the tray context menu reflecting the current enabled state.
 * @param {TrayActions} actions - Tray action callbacks.
 * @returns {Electron.Menu} The built menu.
 */
const buildMenu = (actions) =>
  Menu.buildFromTemplate([
    { label: getSettings().enabled ? 'Wyłącz' : 'Włącz', click: actions.onToggle },
    { label: 'Pokaż okno', click: actions.onShow },
    { type: 'separator' },
    { label: 'Zakończ', click: actions.onQuit },
  ]);

/**
 * Create the system tray icon, tooltip and menu.
 * @param {TrayActions} actions - Tray action callbacks.
 * @returns {Tray} The created tray instance.
 */
export const createTray = (actions) => {
  tray = new Tray(nativeImage.createFromPath(trayIconPath));
  tray.setToolTip('Tajmator');
  tray.on('click', actions.onShow);
  refreshTray(actions);
  return tray;
};

/**
 * Rebuild the tray menu to reflect updated settings.
 * @param {TrayActions} actions - Tray action callbacks.
 * @returns {void}
 */
export const refreshTray = (actions) => {
  tray?.setContextMenu(buildMenu(actions));
};
