import { join } from 'node:path';
import type { WebPreferences } from 'electron';
import { app, BrowserWindow } from 'electron';

/** Web preferences every window uses: isolated, no node, sandboxed. */
export function secureWebPreferences(preload: string): WebPreferences {
  return { preload, contextIsolation: true, nodeIntegration: false, sandbox: true };
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
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
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
