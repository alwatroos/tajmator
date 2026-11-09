import type { IpcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc.ts';
import { validateSettings } from '../shared/settings.ts';
import type { AppState, Settings, UpdateSettingsResult } from '../shared/types.ts';
import type { Engine } from './engine.ts';

export interface IpcDeps {
  ipcMain: Pick<IpcMain, 'handle'>;
  engine: Engine;
  saveSettings: (s: Settings) => void;
  broadcast: (state: AppState) => void;
  openAccessibilitySettings: () => Promise<void>;
}

/**
 * Persists settings and applies them to the engine, even when persisting fails,
 * so they take effect for this session.
 * @returns an error message when the settings could not be saved, otherwise undefined.
 */
export function persistAndApply(
  engine: Engine,
  saveSettings: (s: Settings) => void,
  settings: Settings,
): string | undefined {
  let saveError: string | undefined;
  try {
    saveSettings(settings);
  } catch (error) {
    console.error('Could not save settings', error);
    saveError = 'Could not save settings to disk. They apply until Tajmator quits.';
  }
  engine.applySettings(settings);
  return saveError;
}

export interface TrayToggleDeps {
  engine: Engine;
  saveSettings: (s: Settings) => void;
  showError: (title: string, message: string) => void;
}

/** Applies the tray "Enabled" toggle; a failed save is shown to the user, settings still apply. */
export function applyTrayToggle(deps: TrayToggleDeps, enabled: boolean): void {
  const next = { ...deps.engine.getState().settings, enabled };
  const saveError = persistAndApply(deps.engine, deps.saveSettings, next);
  if (saveError) deps.showError('Settings not saved', saveError);
}

/**
 * Registers the renderer-facing IPC handlers and broadcasts engine state changes.
 * @returns a function that removes the engine subscription.
 */
export function registerIpcHandlers(deps: IpcDeps): () => void {
  const { ipcMain, engine } = deps;
  ipcMain.handle(IPC_CHANNELS.getState, () => engine.getState());
  ipcMain.handle(IPC_CHANNELS.updateSettings, (_event, patch: unknown): UpdateSettingsResult => {
    const base = engine.getState().settings;
    const safePatch =
      typeof patch === 'object' && patch !== null && !Array.isArray(patch) ? patch : {};
    const result = validateSettings({ ...base, ...safePatch });
    if (!result.ok) return { ok: false, errors: result.errors };
    const saveError = persistAndApply(engine, deps.saveSettings, result.settings);
    if (saveError) return { ok: false, errors: {}, saveError };
    return { ok: true, state: engine.getState() };
  });
  ipcMain.handle(IPC_CHANNELS.openAccessibilitySettings, () => deps.openAccessibilitySettings());
  return engine.onChange((state) => deps.broadcast(state));
}
