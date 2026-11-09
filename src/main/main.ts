import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc.ts';
import type { InstallUpdateResult } from '../shared/updates.ts';
import * as accessibility from './accessibility.ts';
import { createRobotCursor } from './cursor.ts';
import { type CursorDriver, Engine } from './engine.ts';
import { persistAndApply, registerIpcHandlers } from './ipc.ts';
import { loadSettings, saveSettings } from './settings-store.ts';
import { createTray } from './tray.ts';
import { bundleIdentity, cleanLeftovers, runningBundle } from './updates/bundle-swap.ts';
import { execFileResult } from './updates/code-signature.ts';
import { createInstallUpdate } from './updates/install-update.ts';
import { registerUpdateIpc } from './updates/update-ipc.ts';
import { buildUpdateMenuSection } from './updates/update-menu.ts';
import { UpdateService } from './updates/update-service.ts';
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

/** Sends a message to every open window. */
function broadcastToWindows(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

/** Builds the update service and the confirmed install flow. */
function createUpdater() {
  const updatesDir = join(app.getPath('userData'), 'updates');
  const service = new UpdateService({
    fetch: (input, init) => fetch(input, init),
    now: () => new Date(),
    currentVersion: app.getVersion(),
    arch: process.arch,
    updatesDir,
    setTimeout: (fn, ms) => setTimeout(fn, ms).unref(),
    clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
  });
  const exePath = app.getPath('exe');
  const bundle = runningBundle(exePath);
  // The running bundle's identity is recorded before any swap so it is never deleted.
  const installer = (bundle ? bundleIdentity(bundle) : Promise.resolve(null)).then((identity) => {
    if (bundle && app.isPackaged) void cleanLeftovers(bundle, identity);
    return createInstallUpdate({
      getVerifiedDownload: () => service.getVerifiedDownload(),
      exec: execFileResult,
      updatesDir,
      exePath,
      isPackaged: app.isPackaged,
      runningIdentity: identity,
      revealFile: (path) => shell.showItemInFolder(path),
      relaunch: () => {
        setTimeout(() => {
          app.relaunch();
          app.quit();
        }, 200);
      },
      log: {
        log: (level, message, fields) => console[level === 'info' ? 'log' : level](message, fields),
      },
    });
  });

  /** Asks for confirmation, installs, and explains a manual or failed outcome. */
  const install = async (): Promise<InstallUpdateResult> => {
    const download = service.getVerifiedDownload();
    if (!download) return { outcome: 'failed', error: 'No verified update is ready to install' };
    const { response } = await dialog.showMessageBox({
      type: 'question',
      message: `Install Tajmator ${download.version} and restart?`,
      detail: 'Tajmator will quit and reopen with the new version.',
      buttons: ['Install and Restart', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return { outcome: 'cancelled' };
    service.setInstalling(true);
    const result = await (await installer)({ version: download.version });
    if (result.outcome !== 'restarting') service.setInstalling(false);
    if (result.outcome === 'manual') {
      await dialog.showMessageBox({
        type: 'info',
        message: 'Install Tajmator manually',
        detail: result.note,
      });
    } else if (result.outcome === 'failed') {
      dialog.showErrorBox('Update failed', result.error);
    }
    return result;
  };
  return { service, install };
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
  const { service: updates, install } = createUpdater();

  const { refresh } = createTray({
    assetsDir,
    getState: () => engine.getState(),
    onChange: (l) => engine.onChange(l),
    actions: {
      setEnabled: (enabled) => {
        const next = { ...engine.getState().settings, enabled };
        persistAndApply(engine, (s) => saveSettings(settingsFile, s), next);
      },
      openWindow: () => win.show(),
      grantAccessibility: () => void accessibility.openSettings(),
      quit: () => app.quit(),
    },
    getExtraSections: () => [
      buildUpdateMenuSection(updates.getStatus(), {
        check: () => void updates.check(),
        download: () => void updates.download(),
        install: () => void install(),
      }),
    ],
  });
  updates.onChange(() => refresh());
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
  registerUpdateIpc({
    ipcMain,
    service: updates,
    install,
    broadcast: (status) => broadcastToWindows(IPC_CHANNELS.updateStatusChanged, status),
  });
  engine.start();
  updates.start();
  win.show();
  const dockIcon = join(assetsDir, 'icon', 'icon.png');
  if (!app.isPackaged && existsSync(dockIcon)) app.dock?.setIcon(dockIcon);
  accessibility.promptOnce();
  app.on('browser-window-focus', () => engine.refreshPermission());
  app.on('activate', () => win.show());
  app.on('second-instance', () => win.show());
  app.on('before-quit', () => {
    updates.stop();
    engine.stop();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('window-all-closed', () => {
    // keep running in the tray
  });
  void app.whenReady().then(boot);
}
