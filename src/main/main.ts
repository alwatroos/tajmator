import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc.ts';
import * as accessibility from './accessibility.ts';
import { createRobotCursor } from './cursor.ts';
import { type CursorDriver, Engine } from './engine.ts';
import { registerIpcHandlers } from './ipc.ts';
import { loadSettings, saveSettings } from './settings-store.ts';
import { createTray } from './tray.ts';
import { createSettingsWindow } from './window.ts';

const appRoot = app.getAppPath();
const assetsDir = join(appRoot, 'assets');

function loadCursor(): CursorDriver {
  try {
    return createRobotCursor();
  } catch (error) {
    console.error('Failed to load the native cursor module', error);
    dialog.showErrorBox(
      'Cursor control unavailable',
      `The native cursor module failed to load, so Tajmator cannot move the cursor.\n\n${String(error)}`,
    );
    return { getPosition: () => ({ x: 0, y: 0 }), moveTo: () => {} };
  }
}

function boot(): void {
  const settingsFile = join(app.getPath('userData'), 'settings.json');
  const engine = new Engine(
    {
      cursor: loadCursor(),
      now: () => new Date(),
      isAccessibilityGranted: accessibility.isGranted,
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
    },
    loadSettings(settingsFile),
  );
  const win = createSettingsWindow(appRoot);

  createTray({
    assetsDir,
    getState: () => engine.getState(),
    onChange: (l) => engine.onChange(l),
    actions: {
      setEnabled: (enabled) => {
        const next = { ...engine.getState().settings, enabled };
        try {
          saveSettings(settingsFile, next);
        } catch (error) {
          console.error('Failed to save settings', error);
        }
        engine.applySettings(next);
      },
      openWindow: () => win.show(),
      grantAccessibility: () => void accessibility.openSettings(),
      quit: () => app.quit(),
    },
  });
  registerIpcHandlers({
    ipcMain,
    engine,
    saveSettings: (s) => saveSettings(settingsFile, s),
    broadcast: (state) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IPC_CHANNELS.stateChanged, state);
      }
    },
    openAccessibilitySettings: accessibility.openSettings,
  });
  engine.start();
  win.show();
  const dockIcon = join(assetsDir, 'icon', 'icon.png');
  if (!app.isPackaged && existsSync(dockIcon)) app.dock?.setIcon(dockIcon);
  accessibility.promptOnce();
  app.on('browser-window-focus', () => engine.refreshPermission());
  app.on('activate', () => win.show());
  app.on('second-instance', () => win.show());
  app.on('before-quit', () => engine.stop());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('window-all-closed', () => {
    // keep running in the tray
  });
  void app.whenReady().then(boot);
}
