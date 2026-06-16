import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseDir = fileURLToPath(new URL('.', import.meta.url));

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** Whether the app is genuinely quitting (vs. hiding to tray). */
let quitting = false;

/**
 * Build BrowserWindow options with a hardened web-preferences set.
 * @returns {Electron.BrowserWindowConstructorOptions} The window options.
 */
const windowOptions = () => ({
  width: 420,
  height: 600,
  resizable: false,
  webPreferences: {
    preload: join(baseDir, '../preload/index.mjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  },
});

/**
 * Load the renderer: dev server URL when present, built HTML otherwise.
 * @param {BrowserWindow} window - The window to load content into.
 * @returns {void}
 */
const loadRenderer = (window) => {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) window.loadURL(devUrl);
  else window.loadFile(join(baseDir, '../renderer/index.html'));
};

/**
 * Hide the window to tray instead of closing, unless quitting.
 * @param {Electron.Event} event - The close event.
 * @returns {void}
 */
const handleClose = (event) => {
  if (quitting) return;
  event.preventDefault();
  mainWindow?.hide();
};

/**
 * Create the main window, or reveal the existing one.
 * @returns {BrowserWindow} The main window instance.
 */
export const createMainWindow = () => {
  if (mainWindow) return revealWindow();
  mainWindow = new BrowserWindow(windowOptions());
  mainWindow.on('close', handleClose);
  mainWindow.on('closed', () => { mainWindow = null; });
  loadRenderer(mainWindow);
  return mainWindow;
};

/**
 * Show and focus the existing main window.
 * @returns {BrowserWindow} The main window instance.
 */
const revealWindow = () => {
  mainWindow.show();
  mainWindow.focus();
  return mainWindow;
};

/**
 * Get the current main window, if any.
 * @returns {BrowserWindow | null} The window or null.
 */
export const getMainWindow = () => mainWindow;

/**
 * Mark the app as quitting so the next close fully closes the window.
 * @returns {void}
 */
export const allowQuit = () => { quitting = true; };
