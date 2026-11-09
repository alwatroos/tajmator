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
    try {
      deps.saveSettings(result.settings);
    } catch (error) {
      console.error('Could not save settings', error);
    }
    engine.applySettings(result.settings);
    return { ok: true, state: engine.getState() };
  });
  ipcMain.handle(IPC_CHANNELS.openAccessibilitySettings, () => deps.openAccessibilitySettings());
  return engine.onChange((state) => deps.broadcast(state));
}
