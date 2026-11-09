import { join } from 'node:path';
import type { WebPreferences } from 'electron';
import { app, BrowserWindow, shell } from 'electron';
import { DOWNLOAD_ORIGIN, UPDATE_REPOSITORY } from './updates/update-constants.ts';

/** Web preferences every window uses: isolated, no node, sandboxed. */
export function secureWebPreferences(preload: string): WebPreferences {
  return { preload, contextIsolation: true, nodeIntegration: false, sandbox: true };
}

/** Whether a link may be handed to the system browser: https://github.com/alwatroos/tajmator/… only. */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.origin === DOWNLOAD_ORIGIN &&
      u.username === '' &&
      u.password === '' &&
      u.pathname.startsWith(`/${UPDATE_REPOSITORY}/`)
    );
  } catch {
    return false;
  }
}

export interface SettingsWindow {
  /** Shows the window, creating it on first use. */
  show(): void;
}

/**
 * Settings window (420x560). Closing hides it; the app keeps running in the tray.
 * @param appRoot - application root holding `dist/`.
 */
export function createSettingsWindow(appRoot: string): SettingsWindow {
  let win: BrowserWindow | null = null;
  let quitting = false;
  app.on('before-quit', () => {
    quitting = true;
  });

  const create = (): BrowserWindow => {
    const w = new BrowserWindow({
      width: 420,
      height: 560,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'Tajmator',
      show: false,
      webPreferences: secureWebPreferences(join(appRoot, 'dist', 'preload', 'preload.cjs')),
    });
    w.setMenuBarVisibility(false);
    w.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternalUrl(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    w.on('close', (e) => {
      if (quitting) return;
      e.preventDefault();
      w.hide();
    });
    w.once('ready-to-show', () => w.show());
    void w.loadFile(join(appRoot, 'dist', 'renderer', 'index.html'));
    return w;
  };

  return {
    show() {
      if (!win || win.isDestroyed()) {
        win = create();
        return;
      }
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    },
  };
}
